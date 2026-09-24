/**
 * Рождение магазина — сага с явными состояниями (этап 3, кусок 3.1).
 *
 * План: merfy-mcp/docs/plans/2026-09-24-stage3-store-commands-saga.md, И3.
 *
 *   reserved ──seed──▶ seeded ──provision──▶ provisioned ──route──▶ ready
 *        └────────────── любой шаг упал ──▶ failed (причина, попытки, время следующей)
 *
 * Доводчик level-triggered: СЛЕДУЮЩИЙ шаг выводится из ФАКТОВ строки магазина
 * (есть ли ревизия, домен, проект Coolify, маршрут хостинга), а не из
 * записанного состояния. Поэтому `failed` не хранит «на каком шаге упали»:
 * при повторе доводчик снова смотрит на факты и делает первое невыполненное.
 * Записанное состояние — сводка для людей и для выборки «что ещё не готово».
 *
 * Всё, что можно выразить данными, — данные: таблица шагов, порядок
 * состояний, расписание повторов. Модуль чистый (без БД и Nest) — его
 * проверяет `__tests__/store-lifecycle.spec.ts`.
 */

export const LIFECYCLE_STATES = [
  "reserved",
  "seeded",
  "provisioned",
  "ready",
  "failed",
] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

/** Состояния, которых магазин достигает (всё, кроме «упал»). */
export type ReachedState = Exclude<LifecycleState, "failed">;

export type LifecycleStep = "seed" | "provision" | "route";

/** Факты строки `site`, по которым доводчик решает, что делать дальше. */
export interface LifecycleFacts {
  /** `current_revision_id` заполнен — стартовая ревизия темы записана. */
  hasRevision: boolean;
  /** `domain_id` заполнен — поддомен REG.RU выдан (domain-сервис). */
  hasDomain: boolean;
  /** `coolify_project_uuid` заполнен — проект тенанта в Coolify есть. */
  hasProject: boolean;
  /** `coolify_app_uuid` заполнен — маршрут хостинга (роутер центрального прокси или app). */
  hasHosting: boolean;
}

interface StepRule {
  step: LifecycleStep;
  /** Состояние, в котором магазин оказывается, когда требование шага выполнено. */
  reaches: Exclude<ReachedState, "reserved">;
  /** Требование шага — по фактам. Шаг идемпотентен: выполненное не повторяется. */
  satisfied: (facts: LifecycleFacts) => boolean;
}

/** Сага как данные: порядок шагов и что каждый обеспечивает. */
export const LIFECYCLE_STEPS: readonly StepRule[] = [
  { step: "seed", reaches: "seeded", satisfied: (f) => f.hasRevision },
  {
    step: "provision",
    reaches: "provisioned",
    satisfied: (f) => f.hasDomain && f.hasProject,
  },
  { step: "route", reaches: "ready", satisfied: (f) => f.hasHosting },
];

const STATE_ORDER: Record<ReachedState, number> = {
  reserved: 0,
  seeded: 1,
  provisioned: 2,
  ready: 3,
};

export interface Observation {
  /** До какого состояния магазин дошёл по фактам. */
  state: ReachedState;
  /** Первое невыполненное требование; `null` — магазин готов. */
  next: LifecycleStep | null;
}

export function observeLifecycle(facts: LifecycleFacts): Observation {
  const index = LIFECYCLE_STEPS.findIndex((rule) => !rule.satisfied(facts));
  if (index === -1) return { state: "ready", next: null };
  const state: ReachedState =
    index === 0 ? "reserved" : LIFECYCLE_STEPS[index - 1].reaches;
  return { state, next: LIFECYCLE_STEPS[index].step };
}

export function isStateAtLeast(
  state: ReachedState,
  target: ReachedState,
): boolean {
  return STATE_ORDER[state] >= STATE_ORDER[target];
}

/**
 * Пауза перед N-й повторной попыткой (N = число неудач подряд). После конца
 * таблицы — последняя строка: доводчик не сдаётся, как не сдавался старый
 * reaper (тот ходил каждые 10 минут бесконечно).
 */
export const RETRY_DELAYS_MS: readonly number[] = [
  30_000, // 30 с
  60_000, // 1 мин
  2 * 60_000,
  5 * 60_000,
  10 * 60_000,
  30 * 60_000,
  60 * 60_000, // потолок — раз в час
];

export function retryDelayMs(attempts: number): number {
  const index = Math.min(Math.max(attempts, 1), RETRY_DELAYS_MS.length) - 1;
  return RETRY_DELAYS_MS[index];
}

/**
 * Аренда строки на время прохода доводчика. Захват = условный UPDATE
 * `lifecycle_next_at` на «сейчас + аренда» (см. lifecycle.repository.ts):
 * пока аренда не истекла, второй доводчик строку не возьмёт. Самый долгий
 * внешний шаг — Coolify RPC с таймаутом 30 с плюс REG.RU через domain-сервис;
 * пять минут — с большим запасом. Упал процесс посреди шага — через пять
 * минут строку подберёт следующий проход (шаги идемпотентны).
 */
export const LEASE_MS = 5 * 60_000;

/** Что делать с `lifecycle_next_at` при записи исхода. */
export type NextAtPolicy =
  /** Снять: строка готова к следующему проходу сразу (или готова совсем). */
  | "clear"
  /** Оставить как есть: проход продолжается, аренда ещё наша. */
  | "keep"
  /** Отложить: следующая попытка не раньше чем через `inMs`. */
  | { inMs: number };

export interface LifecycleRecord {
  state: LifecycleState;
  error: string | null;
  attempts: number;
  nextAt: NextAtPolicy;
}

const MAX_ERROR_LENGTH = 500;

/** Шаг выполнен: сводка обновлена, ошибка и счётчик сброшены. */
export function progressed(
  state: ReachedState,
  nextAt: "clear" | "keep",
): LifecycleRecord {
  return { state, error: null, attempts: 0, nextAt };
}

/** Шаг упал: `failed`, причина с именем шага, счётчик, пауза по таблице. */
export function failedAttempt(
  previousAttempts: number,
  step: LifecycleStep,
  reason: string,
): LifecycleRecord {
  const attempts = previousAttempts + 1;
  return {
    state: "failed",
    error: `${step}: ${reason}`.slice(0, MAX_ERROR_LENGTH),
    attempts,
    nextAt: { inMs: retryDelayMs(attempts) },
  };
}
