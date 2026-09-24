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

/** Шаги саги. Каждый обязан быть идемпотентным: повтор после сбоя безопасен. */
export interface LifecycleStepRunner {
  seed(row: LifecycleRow): Promise<void>;
  provision(row: LifecycleRow): Promise<void>;
  route(row: LifecycleRow): Promise<void>;
}

export const LIFECYCLE_STEP_RUNNER = Symbol("LIFECYCLE_STEP_RUNNER");

export interface AdvanceOptions {
  /** Остановиться, как только магазин дошёл до этого состояния (строка остаётся «созревшей»). */
  stopAfter?: ReachedState;
}

export interface AdvanceResult {
  /** Строку вёл этот проход. `false` — её ведёт другой или время не пришло. */
  claimed: boolean;
  state: LifecycleState | null;
  error: string | null;
}

export function factsOf(row: LifecycleRow): LifecycleFacts {
  return {
    hasRevision: Boolean(row.currentRevisionId),
    hasDomain: Boolean(row.domainId),
    hasProject: Boolean(row.coolifyProjectUuid),
    hasHosting: Boolean(row.coolifyAppUuid),
  };
}

function reasonOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
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
    if (!claimed) {
      const row = await this.repo.read(siteId);
      return {
        claimed: false,
        state: row?.lifecycle ?? null,
        error: row?.lifecycleError ?? null,
      };
    }
    return this.drive(claimed, opts);
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
      if (isDone(seen, opts)) return this.finish(current.id, seen.state);
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
      error: current.lifecycleError,
    };
  }

  /** Проход закончен: состояние записано, аренда снята. */
  private async finish(
    siteId: string,
    state: ReachedState,
  ): Promise<AdvanceResult> {
    await this.repo.record(siteId, progressed(state, "clear"));
    return { claimed: true, state, error: null };
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
      return reasonOf(e);
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
    return { claimed: true, state: "failed", error: record.error };
  }
}
