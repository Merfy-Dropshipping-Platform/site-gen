/**
 * SiteProvisioningScheduler
 *
 * Периодически проверяет активных пользователей без сайтов и создаёт им дефолтный сайт.
 * Запускается каждые 5 минут.
 *
 * Этап 3 (merfy-mcp/docs/plans/2026-09-24-stage3-store-commands-saga.md):
 * магазин создаёт та же команда `CreateStore` (источник `missing-store`,
 * `ifNoStores`), что регистрация и кабинет. Лимит, заморозку и «биллинг не
 * ответил → не создавать» решает команда — один раз; прежний собственный гейт
 * cron (`canCreateSite` по сырому ответу биллинга) переехал в её правила.
 * reaper (`migrateOrphanedSites`) по-прежнему довыполняет только старые
 * магазины (`lifecycle IS NULL`); новые ведёт доводчик саги.
 */
import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ClientProxy } from "@nestjs/microservices";
import { USER_RMQ_SERVICE } from "../constants";
import { SitesDomainService } from "../sites.service";
import { CreateStoreCommand } from "../store/commands/create-store.command";

interface UserWithoutSite {
  userId: string;
  tenantId: string;
  accountId: string;
}

/** Имя магазина, который cron заводит пользователю без магазина. */
export const MISSING_STORE_NAME = "Мой магазин";

@Injectable()
export class SiteProvisioningScheduler implements OnModuleInit {
  private readonly logger = new Logger(SiteProvisioningScheduler.name);
  private isRunning = false;
  private isReaperRunning = false;
  private migrationDone = false;

  constructor(
    @Inject(USER_RMQ_SERVICE) private readonly userClient: ClientProxy,
    private readonly sites: SitesDomainService,
    @Inject(CreateStoreCommand)
    private readonly createStore: Pick<CreateStoreCommand, "execute">,
  ) {}

  async onModuleInit() {
    const startupMigrationEnabled = (
      process.env.SITE_ORPHAN_MIGRATION_ON_STARTUP_ENABLED ?? "true"
    ).toLowerCase();
    if (startupMigrationEnabled === "false") {
      this.logger.log("Orphaned sites migration disabled on startup");
      return;
    }

    // Запускаем миграцию сайтов без subdomain/Coolify при старте (один раз)
    if (!this.migrationDone) {
      this.migrationDone = true;
      this.logger.log("Running orphaned sites migration on startup...");
      try {
        const result = await this.sites.migrateOrphanedSites();
        this.logger.log(
          `Migration complete: ${result.migrated} migrated, ${result.failed} failed`,
        );
        result.details.forEach((d) => this.logger.log(d));
      } catch (e) {
        this.logger.error(
          `Migration failed: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }

  /**
   * Reaper for sites whose async provisioning failed. The async signup
   * flow (`sites.reserve()` + `sites.site.provision_requested`) may leave
   * a row with `domainId IS NULL` if REG.RU is temporarily down. Without
   * this cron, the row stays orphaned until the next service restart
   * (onModuleInit above).
   *
   * Runs every 10 minutes. Guards:
   *  - `migrationDone`: skip until onModuleInit's boot migration has
   *    completed, otherwise two instances of `migrateOrphanedSites` could
   *    run in parallel and double-allocate REG.RU subdomains.
   *  - `isReaperRunning`: prevents a slow tick (e.g. 50 orphans during a
   *    REG.RU recovery burst) from overlapping with the next scheduled
   *    tick for the same reason.
   */
  @Cron("*/10 * * * *")
  async reapOrphanedSites() {
    if (
      (process.env.SITE_PROVISIONING_CRON_ENABLED ?? "true").toLowerCase() ===
      "false"
    ) {
      return;
    }

    if (!this.migrationDone || this.isReaperRunning) {
      return;
    }
    this.isReaperRunning = true;
    try {
      const result = await this.sites.migrateOrphanedSites();
      if (result.migrated > 0 || result.failed > 0) {
        this.logger.log(
          `Reaper tick: ${result.migrated} migrated, ${result.failed} failed`,
        );
      }
    } catch (e) {
      this.logger.error(
        `Reaper tick failed: ${e instanceof Error ? e.message : e}`,
      );
    } finally {
      this.isReaperRunning = false;
    }
  }

  private rpc<T>(
    client: ClientProxy,
    pattern: string,
    data: unknown,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const sub = client.send<T>(pattern, data).subscribe({
        next: (v) => resolve(v),
        error: (e) => reject(e),
        complete: () => sub.unsubscribe(),
      });
    });
  }

  @Cron("*/5 * * * *") // Каждые 5 минут
  async provisionMissingSites() {
    if (this.shouldSkip()) return;

    this.isRunning = true;
    this.logger.log("Site provisioning cron: start");

    try {
      const usersWithoutSites = await this.getUsersWithoutSites();

      for (const user of usersWithoutSites) {
        await this.provisionSiteForUser(user);
      }

      this.logger.log(
        `Site provisioning cron: done, checked ${usersWithoutSites.length} users`,
      );
    } catch (e) {
      this.logger.error(
        `Site provisioning cron failed: ${e instanceof Error ? e.message : e}`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  private shouldSkip(): boolean {
    if (this.isRunning) {
      this.logger.debug("Site provisioning cron: already running, skip");
      return true;
    }

    const enabled = (
      process.env.SITE_PROVISIONING_CRON_ENABLED ?? "true"
    ).toLowerCase();
    if (enabled === "false") {
      return true;
    }

    return false;
  }

  private async getUsersWithoutSites(): Promise<UserWithoutSite[]> {
    try {
      const response = await this.rpc<{
        success: boolean;
        users?: UserWithoutSite[];
      }>(this.userClient, "user.list_without_sites", {});

      if (!response.success || !response.users) {
        return [];
      }

      return response.users;
    } catch (e) {
      this.logger.warn(
        `Failed to get users without sites: ${e instanceof Error ? e.message : e}`,
      );
      return [];
    }
  }

  private async provisionSiteForUser(user: UserWithoutSite): Promise<void> {
    const { userId, tenantId } = user;

    try {
      const result = await this.createStore.execute({
        tenantId,
        actorUserId: userId,
        name: MISSING_STORE_NAME,
        ifNoStores: true,
        wait: false,
        source: "missing-store",
      });
      if (!result.ok) {
        this.logger.debug(
          `User ${userId} (tenant ${tenantId}) site not created: ${result.error.code}`,
        );
        return;
      }
      if (!result.effect.created) {
        this.logger.debug(
          `User ${userId} (tenant ${tenantId}) already has ${result.effect.storeCount} site(s), skip`,
        );
        return;
      }
      this.logger.log(
        `Site reserved: ${result.effect.store?.id} for tenant ${tenantId}, provisioning by the store lifecycle`,
      );
    } catch (e) {
      this.logger.warn(
        `Failed to provision site for user ${userId}: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}
