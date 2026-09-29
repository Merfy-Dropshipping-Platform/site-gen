/**
 * UserListenerController
 *
 * Подписывается на события от user service для асинхронной обработки.
 * - user.registered: создает дефолтный сайт для нового пользователя
 *
 * Два пути, выбирает шлюз (сам листенер ничего не решает):
 * - `newLogic: true` — этап 3 (merfy-mcp/docs/plans/2026-09-24-stage3-store-commands-saga.md,
 *   И1/И2): магазин создаёт та же команда `CreateStore`, что кабинет. Лимит
 *   тарифа и «у тенанта уже есть магазин» (`ifNoStores`) проверяет команда один
 *   раз под блокировкой тенанта; домен и проект Coolify доводит сага.
 *   Шлюз ставит флаг только аккаунтам из списка NEW_LOGIC_EMAILS.
 * - без флага — как до этапа 3: листенер сам спрашивает биллинг и список
 *   магазинов, затем `reserve()` + `triggerAsyncProvisioning`.
 */
import { Controller, Inject, Logger } from "@nestjs/common";
import { Ctx, EventPattern, Payload, RmqContext } from "@nestjs/microservices";
import { ClientProxy } from "@nestjs/microservices";
import { BILLING_RMQ_SERVICE } from "../constants";
import { SitesDomainService } from "../sites.service";
import { CreateStoreCommand } from "../store/commands/create-store.command";

interface UserRegisteredPayload {
  userId: string;
  tenantId: string;
  accountId: string;
  /** Аккаунт из списка новой логики (решает шлюз) — магазин через `CreateStore`. */
  newLogic?: boolean;
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

/** Имя магазина, который получает новый пользователь. */
export const REGISTRATION_STORE_NAME = "Мой сайт";

@Controller()
export class UserListenerController {
  private readonly logger = new Logger(UserListenerController.name);

  constructor(
    @Inject(BILLING_RMQ_SERVICE) private readonly billingClient: ClientProxy,
    private readonly sites: SitesDomainService,
    @Inject(CreateStoreCommand)
    private readonly createStore: Pick<CreateStoreCommand, "execute">,
  ) {}

  @EventPattern("user.registered")
  async handleUserRegistered(
    @Payload() payload: UserRegisteredPayload,
    @Ctx() _ctx: RmqContext,
  ) {
    const { userId, tenantId } = payload ?? ({} as UserRegisteredPayload);
    if (!userId || !tenantId) {
      this.logger.warn("user.registered event missing userId or tenantId");
      return;
    }

    try {
      this.logger.log(
        `Received user.registered event for userId=${userId}, tenantId=${tenantId}, newLogic=${payload.newLogic === true}`,
      );
      if (payload.newLogic === true) {
        await this.viaCreateStore(payload);
        return;
      }
      await this.viaReserve(payload);
    } catch (error) {
      this.logger.error(
        `Failed to process user.registered event: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /** Этап 3: одна команда решает лимит и «магазин уже есть», провижининг ведёт сага. */
  private async viaCreateStore({
    userId,
    tenantId,
  }: UserRegisteredPayload): Promise<void> {
    const result = await this.createStore.execute({
      tenantId,
      actorUserId: userId,
      name: REGISTRATION_STORE_NAME,
      ifNoStores: true,
      wait: false,
      source: "registration",
    });
    if (!result.ok) {
      this.logger.log(
        `Skipping site creation for tenantId=${tenantId}: ${result.error.code}`,
      );
      return;
    }
    this.logger.log(
      result.effect.created
        ? `Default site reserved: siteId=${result.effect.store?.id} tenantId=${tenantId}, provisioning by the store lifecycle`
        : `Skipping site creation for tenantId=${tenantId}: ${result.effect.reason}`,
    );
  }

  /** Как до этапа 3: права из биллинга, список магазинов, reserve + фоновый провижининг. */
  private async viaReserve({
    userId,
    tenantId,
    accountId,
  }: UserRegisteredPayload): Promise<void> {
    const entitlements = await this.readEntitlements(accountId);
    const existingSitesCount = await this.countSites(tenantId);
    const shopsLimit = entitlements?.shopsLimit ?? null;
    const canCreate = shopsLimit === null || existingSitesCount < shopsLimit;

    if (existingSitesCount > 0 || !canCreate) {
      this.logger.log(
        `Skipping site creation for tenantId=${tenantId}: existingSites=${existingSitesCount}, limit=${shopsLimit}, canCreate=${canCreate}`,
      );
      return;
    }

    this.logger.log(`Reserving default site for tenantId=${tenantId}`);
    // Reserve the site row synchronously (~50-100ms) so user-service can
    // create the team row from the `sites.site.created` event immediately.
    // External provisioning (REG.RU subdomain, Coolify) happens in the
    // background via `sites.site.provision_requested` → finishProvisioning.
    const { id: siteId } = await this.sites.reserve({
      tenantId,
      actorUserId: userId,
      name: REGISTRATION_STORE_NAME,
      slug: undefined,
    });
    this.sites.triggerAsyncProvisioning(siteId, tenantId);
    this.logger.log(
      `Default site reserved: siteId=${siteId} tenantId=${tenantId}, provisioning in background`,
    );
  }

  /** Права тарифа; биллинг не ответил — без проверки лимита, как было. */
  private readEntitlements(
    accountId: string,
  ): Promise<BillingEntitlementsResponse> {
    return new Promise((resolve) => {
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
    });
  }

  /** Сколько магазинов у тенанта; список не прочитался — считаем, что нет. */
  private async countSites(tenantId: string): Promise<number> {
    let listResult: SitesListResponse;
    try {
      listResult = await this.sites.list(tenantId, 1, undefined);
    } catch (e) {
      this.logger.warn(`Failed to list sites for ${tenantId}: ${e}`);
      listResult = { success: true, items: [] };
    }
    return Array.isArray(listResult?.items) ? listResult.items.length : 0;
  }
}
