/**
 * UserListenerController
 *
 * Подписывается на события от user service для асинхронной обработки.
 * - user.registered: создает дефолтный сайт для нового пользователя
 */
import { Controller, Inject, Logger } from "@nestjs/common";
import { Ctx, EventPattern, Payload, RmqContext } from "@nestjs/microservices";
import { ClientProxy } from "@nestjs/microservices";
import { BILLING_RMQ_SERVICE } from "../constants";
import { SitesDomainService } from "../sites.service";

interface UserRegisteredPayload {
  userId: string;
  tenantId: string;
  accountId: string;
}

interface BillingEntitlementsResponse {
  shopsLimit?: number | null;
  [key: string]: any;
}

interface SitesListResponse {
  success?: boolean;
  items?: any[];
  [key: string]: any;
}

@Controller()
export class UserListenerController {
  private readonly logger = new Logger(UserListenerController.name);

  constructor(
    @Inject(BILLING_RMQ_SERVICE) private readonly billingClient: ClientProxy,
    private readonly sites: SitesDomainService,
  ) {}

  @EventPattern("user.registered")
  async handleUserRegistered(
    @Payload() payload: UserRegisteredPayload,
    @Ctx() _ctx: RmqContext,
  ) {
    try {
      const { userId, tenantId, accountId } = payload;

      if (!userId || !tenantId) {
        this.logger.warn("user.registered event missing userId or tenantId");
        return;
      }

      this.logger.log(
        `Received user.registered event for userId=${userId}, tenantId=${tenantId}`,
      );

      // Check billing entitlements - does plan allow creating sites?
      const entitlements: BillingEntitlementsResponse = await new Promise(
        (resolve, reject) => {
          const sub = this.billingClient
            .send<BillingEntitlementsResponse>("billing.get_entitlements", {
              accountId,
            })
            .subscribe({
              next: (v) => resolve(v),
              error: (e) => {
                this.logger.warn(
                  `Failed to get entitlements for ${accountId}: ${e}`,
                );
                resolve({ shopsLimit: null }); // Continue without entitlements check
              },
              complete: () => sub.unsubscribe(),
            });
        },
      );

      // Check if user already has sites
      let listResult: SitesListResponse;
      try {
        listResult = await this.sites.list(tenantId, 1, undefined);
      } catch (e) {
        this.logger.warn(`Failed to list sites for ${tenantId}: ${e}`);
        listResult = { success: true, items: [] };
      }

      const existingSitesCount = Array.isArray(listResult?.items)
        ? listResult.items.length
        : 0;
      const shopsLimit = entitlements?.shopsLimit ?? null;
      const canCreate = shopsLimit === null || existingSitesCount < shopsLimit;

      if (existingSitesCount === 0 && canCreate) {
        this.logger.log(`Creating default site for tenantId=${tenantId}`);

        const siteId = await this.sites.create({
          tenantId,
          actorUserId: userId,
          name: "Мой сайт",
          slug: undefined,
        });

        this.logger.log(
          `Default site created: siteId=${siteId} for tenantId=${tenantId}`,
        );
      } else {
        this.logger.log(
          `Skipping site creation for tenantId=${tenantId}: existingSites=${existingSitesCount}, limit=${shopsLimit}, canCreate=${canCreate}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to process user.registered event: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
