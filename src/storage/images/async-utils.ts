export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "unknown_error";

/** Таймер не держит процесс: сервис завершается по сигналу, а не ждёт конца паузы. */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms).unref());

/**
 * Ждёт задачу не дольше бюджета. Истёк бюджет — возвращается, задача идёт
 * дальше сама. Ошибку задачи не пробрасывает: её разбирает вызывающий.
 */
export async function waitUpTo(
  task: Promise<unknown>,
  budgetMs: number,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const budget = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, budgetMs);
  });
  try {
    await Promise.race([task.catch(() => undefined), budget]);
  } finally {
    clearTimeout(timer);
  }
}

export const QUEUE_FULL = "image_queue_full";

export interface Limiter {
  run<T>(task: () => Promise<T>): Promise<T>;
}

/**
 * Не больше `concurrency` задач одновременно, остальные ждут в очереди длиной
 * до `maxQueue`. Очередь переполнена — `run` отказывает сразу: в ожидании лежат
 * байты картинок, держать их без предела нельзя.
 */
export function createLimiter(concurrency: number, maxQueue: number): Limiter {
  let active = 0;
  const waiting: Array<() => void> = [];

  async function acquire(): Promise<void> {
    if (active < concurrency) {
      active += 1;
      return;
    }
    if (waiting.length >= maxQueue) throw new Error(QUEUE_FULL);
    // Место передаёт тот, кто освободился: счётчик active не меняется.
    await new Promise<void>((resolve) => waiting.push(resolve));
  }

  function release(): void {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  }

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}
