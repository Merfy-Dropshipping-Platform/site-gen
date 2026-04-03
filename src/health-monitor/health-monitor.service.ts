/**
 * HealthMonitorService — автоматическая диагностика и восстановление сайтов.
 *
 * Каждые 15 минут:
 * 1. Проверяет доступность MinIO (pre-check)
 * 2. Проверяет все published сайты (curl site + /health)
 * 3. Для degraded сайтов — ставит пересборку в очередь
 * 4. Логирует все действия в site_repair_log
 *
 * Защита от циклов: max 3 rebuild_queued за 24ч на сайт.
 * Включается env HEALTH_MONITOR_ENABLED=true.
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { randomUUID } from "crypto";
import { and, eq, gt, sql, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { PG_CONNECTION } from "../constants";
import * as schema from "../db/schema";
import { BuildQueuePublisher } from "../rabbitmq/build-queue.service";
import {
  SiteHealthStatus,
  type SiteCheckResult,
  type HealthCheckSummary,
} from "./health-monitor.types";

const MINIO_URL = "https://minio.merfy.ru";
const CHECK_TIMEOUT_MS = 10_000;
const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes
const MAX_REPAIRS_PER_24H = 3;

@Injectable()
export class HealthMonitorService {
  private readonly logger = new Logger(HealthMonitorService.name);
  private running = false;

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly buildQueue: BuildQueuePublisher,
  ) {}

  @Cron("0 */15 * * * *")
  async checkSitesHealth(): Promise<void> {
    if (process.env.HEALTH_MONITOR_ENABLED !== "true") return;
    if (this.running) {
      this.logger.warn("HealthMonitor: previous cycle still running, skipping");
      return;
    }

    this.running = true;
    this.logger.log("HealthMonitor: check cycle started");

    const summary: HealthCheckSummary = {
      total: 0,
      healthy: 0,
      degraded: 0,
      failed: 0,
      timeout: 0,
      repairsTriggered: 0,
      repairsSkippedLimit: 0,
      repairsSkippedGrace: 0,
    };

    try {
      // Step 1: MinIO pre-check
      const minioOk = await this.checkMinioHealth();
      if (!minioOk) {
        this.logger.warn(
          "HealthMonitor: MinIO unreachable, skipping entire cycle",
        );
        this.running = false;
        return;
      }

      // Step 2: Resolve pending repairs from previous cycle
      await this.resolvePendingRepairs();

      // Step 3: Get published sites
      const sites = await this.getPublishedSites();
      summary.total = sites.length;

      // Step 4: Check each site sequentially
      for (const site of sites) {
        if (!site.publicUrl || !site.tenantId || !site.storageSlug) continue;
        const result = await this.checkSiteHealth(site.publicUrl);
        const checkResult: SiteCheckResult = {
          siteId: site.id,
          tenantId: site.tenantId,
          publicUrl: site.publicUrl,
          storageSlug: site.storageSlug,
          siteStatusCode: result.siteCode,
          healthStatusCode: result.healthCode,
          status: result.status,
        };

        switch (result.status) {
          case SiteHealthStatus.Healthy:
            summary.healthy++;
            break;
          case SiteHealthStatus.Failed:
            summary.failed++;
            break;
          case SiteHealthStatus.Timeout:
            summary.timeout++;
            break;
          case SiteHealthStatus.Degraded:
            summary.degraded++;
            await this.handleDegradedSite(checkResult, summary);
            break;
        }
      }

      this.logger.log(
        `HealthMonitor: cycle completed — ${JSON.stringify(summary)}`,
      );
    } catch (err) {
      this.logger.error(
        `HealthMonitor: cycle failed — ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async checkMinioHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
      const res = await fetch(MINIO_URL, { signal: controller.signal });
      clearTimeout(timer);
      // 400/403 = MinIO is alive (auth required). 5xx = problem.
      return res.status < 500;
    } catch {
      return false;
    }
  }

  private async checkSiteHealth(
    publicUrl: string,
  ): Promise<{ siteCode: number; healthCode: number; status: SiteHealthStatus }> {
    const siteCode = await this.httpGet(publicUrl);
    const healthCode = await this.httpGet(`${publicUrl}/health`);

    let status: SiteHealthStatus;
    if (siteCode === 0 || healthCode === 0) {
      status = SiteHealthStatus.Timeout;
    } else if (healthCode === 200 && siteCode === 200) {
      status = SiteHealthStatus.Healthy;
    } else if (healthCode === 200 && siteCode !== 200) {
      status = SiteHealthStatus.Degraded;
    } else {
      status = SiteHealthStatus.Failed;
    }

    return { siteCode, healthCode, status };
  }

  private async httpGet(url: string): Promise<number> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timer);
      return res.status;
    } catch {
      return 0; // timeout or network error
    }
  }

  private async getPublishedSites() {
    const rows = await this.db
      .select({
        id: schema.site.id,
        tenantId: schema.site.tenantId,
        publicUrl: schema.site.publicUrl,
        storageSlug: schema.site.storageSlug,
        updatedAt: schema.site.updatedAt,
      })
      .from(schema.site)
      .where(
        and(
          eq(schema.site.status, "published"),
          sql`${schema.site.coolifyAppUuid} IS NOT NULL`,
          sql`${schema.site.publicUrl} IS NOT NULL`,
        ),
      );

    // Deduplicate by storageSlug (some sites have multiple rows)
    const seen = new Set<string>();
    return rows.filter((r) => {
      if (!r.storageSlug || seen.has(r.storageSlug)) return false;
      seen.add(r.storageSlug);
      return true;
    });
  }

  private async handleDegradedSite(
    check: SiteCheckResult,
    summary: HealthCheckSummary,
  ): Promise<void> {
    // Grace period: skip if published < 5 min ago
    const site = await this.db
      .select({ updatedAt: schema.site.updatedAt })
      .from(schema.site)
      .where(eq(schema.site.id, check.siteId))
      .then((r) => r[0]);

    if (site?.updatedAt) {
      const elapsed = Date.now() - new Date(site.updatedAt).getTime();
      if (elapsed < GRACE_PERIOD_MS) {
        await this.insertRepairLog(check, "skipped_grace_period");
        summary.repairsSkippedGrace++;
        this.logger.log(
          `HealthMonitor: skipping ${check.storageSlug} — grace period (${Math.round(elapsed / 1000)}s)`,
        );
        return;
      }
    }

    // Retry limit: max 3 rebuilds per 24h
    const attemptsIn24h = await this.getRepairAttemptsInWindow(check.siteId);
    if (attemptsIn24h >= MAX_REPAIRS_PER_24H) {
      await this.insertRepairLog(check, "skipped_limit");
      summary.repairsSkippedLimit++;
      this.logger.warn(
        `HealthMonitor: site ${check.storageSlug} reached repair limit (${attemptsIn24h}/${MAX_REPAIRS_PER_24H} in 24h), manual intervention required`,
      );
      return;
    }

    // Queue rebuild
    await this.repairSite(check);
    summary.repairsTriggered++;
  }

  private async getRepairAttemptsInWindow(siteId: string): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.siteRepairLog)
      .where(
        and(
          eq(schema.siteRepairLog.siteId, siteId),
          eq(schema.siteRepairLog.action, "rebuild_queued"),
          gt(schema.siteRepairLog.detectedAt, cutoff),
        ),
      );
    return result[0]?.count ?? 0;
  }

  private async repairSite(check: SiteCheckResult): Promise<void> {
    const buildId = randomUUID();

    try {
      await this.buildQueue.queueBuild({
        tenantId: check.tenantId,
        siteId: check.siteId,
        priority: 1,
        trigger: "auto_repair",
      });

      await this.insertRepairLog(check, "rebuild_queued", "pending");

      this.logger.log(
        `HealthMonitor: queued rebuild for site ${check.storageSlug} (site=${check.siteStatusCode}, health=${check.healthStatusCode})`,
      );
    } catch (err) {
      this.logger.error(
        `HealthMonitor: failed to queue rebuild for ${check.storageSlug}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async insertRepairLog(
    check: SiteCheckResult,
    action: "rebuild_queued" | "skipped_limit" | "skipped_grace_period" | "skipped_minio_down",
    result?: "success" | "failure" | "pending",
  ): Promise<void> {
    await this.db.insert(schema.siteRepairLog).values({
      id: randomUUID(),
      siteId: check.siteId,
      action,
      siteStatusCode: check.siteStatusCode,
      healthStatusCode: check.healthStatusCode,
      result: result ?? null,
    });
  }

  private async resolvePendingRepairs(): Promise<void> {
    const pending = await this.db
      .select({
        id: schema.siteRepairLog.id,
        siteId: schema.siteRepairLog.siteId,
      })
      .from(schema.siteRepairLog)
      .where(
        and(
          eq(schema.siteRepairLog.result, "pending"),
          isNull(schema.siteRepairLog.resolvedAt),
        ),
      );

    for (const entry of pending) {
      // Get site public URL
      const site = await this.db
        .select({ publicUrl: schema.site.publicUrl })
        .from(schema.site)
        .where(eq(schema.site.id, entry.siteId))
        .then((r) => r[0]);

      if (!site?.publicUrl) continue;

      const siteCode = await this.httpGet(site.publicUrl);

      if (siteCode === 200) {
        await this.db
          .update(schema.siteRepairLog)
          .set({ result: "success", resolvedAt: new Date() })
          .where(eq(schema.siteRepairLog.id, entry.id));
        this.logger.log(
          `HealthMonitor: repair resolved successfully for site ${entry.siteId}`,
        );
      } else {
        // Check if enough time has passed (> 10 min since detection = likely failed)
        await this.db
          .update(schema.siteRepairLog)
          .set({ result: "failure", errorMessage: `Still degraded (status=${siteCode})` })
          .where(
            and(
              eq(schema.siteRepairLog.id, entry.id),
              sql`${schema.siteRepairLog.detectedAt} < NOW() - INTERVAL '10 minutes'`,
            ),
          );
      }
    }
  }
}
