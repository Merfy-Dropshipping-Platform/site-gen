import type { BackfillOptions } from "./image-backfill";
import type { VariantsOptions } from "./image-variants";

const MINUTE_MS = 60_000;

/** Число из окружения; пусто или не число — значение по умолчанию. */
function numberFrom(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
): number {
  const raw = env[key];
  const parsed = Number(raw);
  return raw && Number.isFinite(parsed) ? parsed : fallback;
}

export function variantsOptionsFrom(env: NodeJS.ProcessEnv): VariantsOptions {
  return {
    budgetMs: numberFrom(env, "IMAGES_UPLOAD_BUDGET_MS", 4000),
    concurrency: 2,
    maxQueue: numberFrom(env, "IMAGES_QUEUE_MAX", 50),
  };
}

export interface BackfillSchedule {
  enabled: boolean;
  intervalMs: number;
  options: BackfillOptions;
}

/** Пережатие старых картинок выключено, пока в окружении явно не `true`. */
export function backfillScheduleFrom(env: NodeJS.ProcessEnv): BackfillSchedule {
  return {
    enabled: (env.IMAGES_BACKFILL_ENABLED ?? "").toLowerCase() === "true",
    intervalMs: numberFrom(env, "IMAGES_BACKFILL_INTERVAL_MIN", 30) * MINUTE_MS,
    options: {
      prefix: "media/",
      pauseMs: numberFrom(env, "IMAGES_BACKFILL_PAUSE_MS", 300),
      maxAttempts: 3,
      maxLoadPerCore: numberFrom(env, "IMAGES_BACKFILL_MAX_LOAD", 0.8),
      overloadPauseMs: 10_000,
    },
  };
}
