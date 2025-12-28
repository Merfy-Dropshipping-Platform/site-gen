/**
 * SiteProvisioningScheduler
 *
 * Периодически проверяет активных пользователей без сайтов и создаёт им дефолтный сайт.
 * Запускается каждые 5 минут.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import { BILLING_RMQ_SERVICE, USER_RMQ_SERVICE } from '../constants';
import { SitesDomainService } from '../sites.service';

interface UserWithoutSite {
  userId: string;
  tenantId: string;
  accountId: string;
}

interface EntitlementsResponse {
  success: boolean;
  frozen?: boolean;
  shopsLimit?: number | null;
}

@Injectable()
export class SiteProvisioningScheduler {
  private readonly logger = new Logger(SiteProvisioningScheduler.name);
  private isRunning = false;

  constructor(
    @Inject(BILLING_RMQ_SERVICE) private readonly billingClient: ClientProxy,
    @Inject(USER_RMQ_SERVICE) private readonly userClient: ClientProxy,
    private readonly sites: SitesDomainService,
  ) {}

  private rpc<T>(client: ClientProxy, pattern: string, data: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const sub = client.send<T>(pattern, data).subscribe({
        next: (v) => resolve(v),
        error: (e) => reject(e),
        complete: () => sub.unsubscribe(),
      });
    });
  }

  @Cron('*/5 * * * *') // Каждые 5 минут
  async provisionMissingSites() {
    if (this.shouldSkip()) return;

    this.isRunning = true;
    this.logger.log('Site provisioning cron: start');

    try {
      const usersWithoutSites = await this.getUsersWithoutSites();

      for (const user of usersWithoutSites) {
        await this.provisionSiteForUser(user);
      }

      this.logger.log(`Site provisioning cron: done, checked ${usersWithoutSites.length} users`);
    } catch (e) {
      this.logger.error(`Site provisioning cron failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.isRunning = false;
    }
  }

  private shouldSkip(): boolean {
    if (this.isRunning) {
      this.logger.debug('Site provisioning cron: already running, skip');
      return true;
    }

    const enabled = (process.env.SITE_PROVISIONING_CRON_ENABLED ?? 'true').toLowerCase();
    if (enabled === 'false') {
      return true;
    }

    return false;
  }

  private async getUsersWithoutSites(): Promise<UserWithoutSite[]> {
    try {
      const response = await this.rpc<{ success: boolean; users?: UserWithoutSite[] }>(
        this.userClient,
        'user.list_without_sites',
        {},
      );

      if (!response.success || !response.users) {
        return [];
      }

      return response.users;
    } catch (e) {
      this.logger.warn(`Failed to get users without sites: ${e instanceof Error ? e.message : e}`);
      return [];
    }
  }

  private async provisionSiteForUser(user: UserWithoutSite): Promise<void> {
    const { userId, tenantId, accountId } = user;

    try {
      // Проверяем что у пользователя реально нет сайтов
      const existingSites = await this.sites.list(tenantId, 1);
      if (existingSites.items.length > 0) {
        this.logger.debug(`User ${userId} already has sites, skip`);
        return;
      }

      // Проверяем биллинг
      const entitlements = await this.getEntitlements(accountId);
      if (!this.canCreateSite(entitlements)) {
        this.logger.debug(`User ${userId} cannot create site: frozen or no quota`);
        return;
      }

      // Создаём сайт
      this.logger.log(`Provisioning site for user ${userId}, tenant ${tenantId}`);
      const result = await this.sites.create({
        tenantId,
        actorUserId: userId,
        name: 'Мой магазин',
      });

      this.logger.log(`Site provisioned: ${result.id} for tenant ${tenantId}`);
    } catch (e) {
      this.logger.warn(`Failed to provision site for user ${userId}: ${e instanceof Error ? e.message : e}`);
    }
  }

  private async getEntitlements(accountId: string): Promise<EntitlementsResponse> {
    try {
      return await this.rpc<EntitlementsResponse>(
        this.billingClient,
        'billing.get_entitlements',
        { accountId },
      );
    } catch (e) {
      this.logger.warn(`Failed to get entitlements for ${accountId}: ${e instanceof Error ? e.message : e}`);
      return { success: false };
    }
  }

  private canCreateSite(entitlements: EntitlementsResponse): boolean {
    if (!entitlements.success) return false;
    if (entitlements.frozen) return false;

    const limit = entitlements.shopsLimit;
    return limit === null || limit === undefined || limit > 0;
  }
}
