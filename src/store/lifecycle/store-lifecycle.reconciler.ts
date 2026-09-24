/**
 * Доводчик рождения магазина (этап 3, кусок 3.1) — один на все входы.
 *
 * `advance(siteId)` берёт строку в аренду (условный UPDATE, см.
 * lifecycle.repository.ts), смотрит на ФАКТЫ строки, делает первое
 * невыполненное требование саги, перечитывает факты и так до `ready`, первого
 * провала или состояния `stopAfter`. Провал — `failed` с причиной, счётчиком и
 * временем следующей попытки по таблице пауз (store-lifecycle.ts).
 *
 * Кто зовёт:
 *   - команда `CreateStore` — сразу после записи строки (сид синхронно, дальше
 *     фоном или до `ready`, если просили `wait`);
 *   - `StoreLifecycleScheduler` — тиком по созревшим строкам (level-triggered:
 *     что бы ни потерялось, строка сама себя «напомнит» через выборку).
 *
 * Два доводчика одновременно не делают двойной работы: строку ведёт тот, кто
 * её захватил; второй получает `claimed: false` и уходит.
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  LEASE_MS,
  LIFECYCLE_STEPS,
  failedAttempt,
  isStateAtLeast,
  observeLifecycle,
  progressed,
  type LifecycleFacts,
  type LifecycleState,
  type LifecycleStep,
  type Observation,
  type ReachedState,
} from "./store-lifecycle";
import {
  LIFECYCLE_REPOSITORY,
  type LifecycleRepository,
  type LifecycleRow,
} from "./lifecycle.repository";
import { errorMessage } from "../shared/error-message";

/** Шаги саги. Каждый обязан быть идемпотентным: повтор после сбоя безопасен. */
export interface LifecycleStepRunner {
  seed(row: LifecycleRow): Promise<void>;
  provision(row: LifecycleRow): Promise<void>;
  route(row: LifecycleRow): Promise<void>;
}

export const LIFECYCLE_STEP_RUNNER = Symbol("LIFECYCLE_STEP_RUNNER");

export interface AdvanceOptions {
  /** Остановиться, как только магазин дошёл до этого состояния. */
  stopAfter?: ReachedState;
  /**
   * Остановившись на `stopAfter`, оставить аренду за вызывающим (он доведёт
   * строку сам, `driveHeld`). Без флага строка сразу становится «созревшей».
   */
  keepLease?: boolean;
}

export interface AdvanceResult {
  /** Строку вёл этот проход. `false` — её ведёт другой или время не пришло. */
  claimed: boolean;
  state: LifecycleState | null;
  /** Аренда по-прежнему у вызывающего: он может продолжить `driveHeld`. */
  leaseKept: boolean;
}

export function factsOf(row: LifecycleRow): LifecycleFacts {
  return {
    hasRevision: Boolean(row.currentRevisionId),
    hasDomain: Boolean(row.domainId),
    hasProject: Boolean(row.coolifyProjectUuid),
    hasHosting: Boolean(row.coolifyAppUuid),
  };
}

/** Магазин готов или дошёл до состояния, после которого просили остановиться. */
function isDone(seen: Observation, opts: AdvanceOptions): boolean {
  return (
    !seen.next ||
    Boolean(opts.stopAfter && isStateAtLeast(seen.state, opts.stopAfter))
  );
}

@Injectable()
export class StoreLifecycleReconciler {
  private readonly logger = new Logger(StoreLifecycleReconciler.name);

  constructor(
    @Inject(LIFECYCLE_REPOSITORY) private readonly repo: LifecycleRepository,
    @Inject(LIFECYCLE_STEP_RUNNER) private readonly steps: LifecycleStepRunner,
  ) {}

  async advance(
    siteId: string,
    opts: AdvanceOptions = {},
  ): Promise<AdvanceResult> {
    const claimed = await this.repo.claim(siteId, LEASE_MS);
    if (!claimed) return this.notDriven(siteId);
    return this.drive(claimed, opts);
  }

  /**
   * Ведёт строку, которую вызывающий УЖЕ держит: `CreateStore` вставляет
   * магазин сразу с арендой (`lifecycle_next_at` в будущем), поэтому тик его не
   * берёт, а команда ведёт без захвата — сид успевает до ответа (В3).
   * Звать только держателю аренды.
   */
  async driveHeld(
    siteId: string,
    opts: AdvanceOptions = {},
  ): Promise<AdvanceResult> {
    const row = await this.repo.read(siteId);
    if (!row) return this.notDriven(siteId);
    return this.drive(row, opts);
  }

  /** Один проход по созревшим строкам (для cron). Строки идут по очереди. */
  async tick(limit = 20): Promise<{ processed: number }> {
    const ids = await this.repo.listDue(limit);
    let processed = 0;
    for (const id of ids) {
      const result = await this.advance(id);
      if (result.claimed) processed += 1;
    }
    return { processed };
  }

  /**
   * Ведёт захваченную строку. Число итераций ограничено числом шагов саги:
   * каждый успешный проход цикла выполняет новое требование, иначе — выход.
   */
  private async drive(
    row: LifecycleRow,
    opts: AdvanceOptions,
  ): Promise<AdvanceResult> {
    let current = row;
    let seen = observeLifecycle(factsOf(current));
    for (let i = 0; i <= LIFECYCLE_STEPS.length; i += 1) {
      if (isDone(seen, opts)) return this.finish(current.id, seen, opts);
      const step = seen.next as LifecycleStep;
      const failure = await this.runStep(step, current);
      current = (await this.repo.read(current.id)) ?? current;
      const after = observeLifecycle(factsOf(current));
      const reason =
        failure ??
        (after.next === step ? "requirement not met after step" : null);
      if (reason !== null) return this.fail(current, step, reason);
      // Промежуточное состояние видно сразу; аренда остаётся за этим проходом.
      if (!isDone(after, opts))
        await this.repo.record(current.id, progressed(after.state, "keep"));
      seen = after;
    }
    return {
      claimed: true,
      state: current.lifecycle,
      leaseKept: false,
    };
  }

  /**
   * Проход закончен: состояние записано. Аренда снимается — кроме остановки
   * на `stopAfter` с `keepLease`: тогда она остаётся у вызывающего.
   */
  private async finish(
    siteId: string,
    seen: Observation,
    opts: AdvanceOptions,
  ): Promise<AdvanceResult> {
    const leaseKept = Boolean(seen.next && opts.keepLease);
    await this.repo.record(
      siteId,
      progressed(seen.state, leaseKept ? "keep" : "clear"),
    );
    return { claimed: true, state: seen.state, leaseKept };
  }

  private async notDriven(siteId: string): Promise<AdvanceResult> {
    const row = await this.repo.read(siteId);
    return {
      claimed: false,
      state: row?.lifecycle ?? null,
      leaseKept: false,
    };
  }

  /** Выполнить шаг; вернуть причину провала или `null`. */
  private async runStep(
    step: LifecycleStep,
    row: LifecycleRow,
  ): Promise<string | null> {
    try {
      await this.steps[step](row);
      return null;
    } catch (e) {
      return errorMessage(e);
    }
  }

  private async fail(
    row: LifecycleRow,
    step: LifecycleStep,
    reason: string,
  ): Promise<AdvanceResult> {
    const record = failedAttempt(row.lifecycleAttempts ?? 0, step, reason);
    await this.repo.record(row.id, record);
    this.logger.warn(
      `store lifecycle: site=${row.id} ${record.error} (attempt ${record.attempts}, next in ${
        typeof record.nextAt === "object" ? record.nextAt.inMs : 0
      } ms)`,
    );
    return {
      claimed: true,
      state: "failed",
      leaseKept: false,
    };
  }
}
