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
  /** Нужен ли маршруту проект тенанта в Coolify (нет при центральном прокси). */
  projectRequired(): boolean;
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

export function factsOf(
  row: LifecycleRow,
  projectRequired: boolean,
): LifecycleFacts {
  return {
    projectRequired,
    hasRevision: Boolean(row.currentRevisionId),
    hasDomain: Boolean(row.domainId),
    hasProject: Boolean(row.coolifyProjectUuid),
    hasHosting: Boolean(row.coolifyAppUuid),
  };
}

/**
 * Шаг, который проходу осталось сделать; `null` — делать нечего: магазин
 * готов или дошёл до состояния, после которого просили остановиться.
 */
function stepToRun(
  seen: Observation,
  opts: AdvanceOptions,
): LifecycleStep | null {
  if (opts.stopAfter && isStateAtLeast(seen.state, opts.stopAfter)) return null;
  return seen.next;
}

/** Исход одного шага прохода (`runOnce`). */
type StepOutcome =
  /** Делать больше нечего — записать достигнутое состояние. */
  | { kind: "done"; row: LifecycleRow; seen: Observation }
  /** Шаг упал или его факт не появился. */
  | { kind: "failed"; row: LifecycleRow; step: LifecycleStep; reason: string }
  /** Требование шага выполнено, дальше — шаг `next`. */
  | { kind: "progressed"; row: LifecycleRow; next: LifecycleStep };

const REQUIREMENT_NOT_MET = "requirement not met after step";
const SAGA_NOT_CONVERGED = "saga did not converge";

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
    const claimed = await this.repo.claim(siteId);
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
   * Ведёт захваченную строку: шаг за шагом, пока есть что делать. Каждый
   * успешный шаг выполняет новое требование саги, поэтому шагов по числу
   * шагов саги хватает с запасом. Не хватило — факты откатываются между
   * шагами (например, ревизию сняли параллельно): это провал «сага не
   * сошлась» с записью исхода, а не тихий выход с арендой.
   */
  private async drive(
    row: LifecycleRow,
    opts: AdvanceOptions,
  ): Promise<AdvanceResult> {
    let outcome = await this.runOnce(row, opts);
    for (const _ of LIFECYCLE_STEPS) {
      if (outcome.kind !== "progressed") break;
      outcome = await this.runOnce(outcome.row, opts);
    }
    return this.conclude(outcome, opts);
  }

  /**
   * Один шаг: посмотреть на факты, сделать первое невыполненное требование,
   * перечитать строку и проверить, что факт появился. Промежуточное
   * состояние записывается сразу; аренда остаётся за этим проходом.
   */
  private async runOnce(
    row: LifecycleRow,
    opts: AdvanceOptions,
  ): Promise<StepOutcome> {
    const seen = observeLifecycle(factsOf(row, this.steps.projectRequired()));
    const step = stepToRun(seen, opts);
    if (!step) return { kind: "done", row, seen };

    const failure = await this.runStep(step, row);
    const current = (await this.repo.read(row.id)) ?? row;
    const after = observeLifecycle(
      factsOf(current, this.steps.projectRequired()),
    );
    const reason =
      failure ?? (after.next === step ? REQUIREMENT_NOT_MET : null);
    if (reason !== null) return { kind: "failed", row: current, step, reason };

    const next = stepToRun(after, opts);
    if (!next) return { kind: "done", row: current, seen: after };
    await this.repo.record(current.id, progressed(after.state, "keep"));
    return { kind: "progressed", row: current, next };
  }

  /** Записать исход прохода. */
  private conclude(
    outcome: StepOutcome,
    opts: AdvanceOptions,
  ): Promise<AdvanceResult> {
    if (outcome.kind === "done")
      return this.finish(outcome.row.id, outcome.seen, opts);
    if (outcome.kind === "failed")
      return this.fail(outcome.row, outcome.step, outcome.reason);
    return this.fail(outcome.row, outcome.next, SAGA_NOT_CONVERGED);
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
