/**
 * Тик доводчика рождения магазина (этап 3, кусок 3.1).
 *
 * Раз в 30 секунд берёт созревшие строки (`lifecycle` не пуст и не `ready`,
 * время следующей попытки пришло) и двигает их `StoreLifecycleReconciler`.
 * Частый тик дёшев: выборка идёт по частичному индексу
 * `idx_site_lifecycle_next_at` (только строки в саге), реальные повторы
 * держит таблица пауз в `store-lifecycle.ts`, а не расписание cron.
 *
 * Со старыми cron (`site-provisioning.scheduler.ts`) не дерутся по построению:
 * reaper и startup-миграция берут только `lifecycle IS NULL`, доводчик —
 * только `IS NOT NULL`. Выключатель тот же, что у старых: локально
 * `SITE_PROVISIONING_CRON_ENABLED=false` глушит весь фоновый провижининг.
 */
import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { StoreLifecycleReconciler } from "./store-lifecycle.reconciler";

export const LIFECYCLE_TICK_LIMIT = 20;

@Injectable()
export class StoreLifecycleScheduler {
  private readonly logger = new Logger(StoreLifecycleScheduler.name);
  private running = false;

  constructor(private readonly reconciler: StoreLifecycleReconciler) {}

  @Cron("*/30 * * * * *")
  async tick(): Promise<void> {
    if (!this.enabled() || this.running) return;
    this.running = true;
    try {
      const { processed } = await this.reconciler.tick(LIFECYCLE_TICK_LIMIT);
      if (processed > 0)
        this.logger.log(`store lifecycle tick: advanced ${processed} store(s)`);
    } catch (e) {
      this.logger.error(
        `store lifecycle tick failed: ${e instanceof Error ? e.message : e}`,
      );
    } finally {
      this.running = false;
    }
  }

  private enabled(): boolean {
    return (
      (process.env.SITE_PROVISIONING_CRON_ENABLED ?? "true").toLowerCase() !==
      "false"
    );
  }
}
