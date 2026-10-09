import type { Log } from './log';
import { startHeldReleases, type Database, type ShopStateOptions, type StartedJob } from './shop-state';

// Порции выпуска темы (design.md блока 6, В6-2 В): одна очередь с приоритетом, а выпуск подаёт задания порциями — в
// работе не больше K заданий выпуска, K меньше числа мест. Кто подаёт сам выпуск (событие theme-release на каждый
// магазин темы), решает блок 10; предел держит сборщик.

// K по умолчанию — на одно меньше мест, но не меньше одного. При одном месте (dev) K = 1: волна идёт по одному
// магазину, а публикация ждёт не дольше одной сборки выпуска — той, что уже идёт: приоритет переставляет ждущие.
export const releaseSlotsFor = (buildSlots: number): number => Math.max(1, buildSlots - 1);

export interface ReleaseDeps {
  db: Database;
  shopState: ShopStateOptions;
  releaseSlots: number;
  log: Log;
  enqueue: (job: StartedJob) => Promise<void>;
}

// Место выпуска могло освободиться — задания ждущим магазинам волны, до K в работе.
export async function queueHeldReleases(deps: ReleaseDeps): Promise<void> {
  const started = await startHeldReleases(deps.db, deps.shopState, deps.releaseSlots);
  if (started.length > 0) deps.log('release-started', { shops: started.length, releaseSlots: deps.releaseSlots });
  for (const job of started) await deps.enqueue(job);
}
