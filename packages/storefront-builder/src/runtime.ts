import { acceptIncoming } from './accept';
import { EVENTS_QUEUE, JOBS_QUEUE, type Broker, type Delivery } from './broker';
import { runBuildJob, settle, type BuilderDeps } from './build-job';
import { errorText } from './errors';
import { buildReplyBody, parseIncoming, parseJob } from './events';
import type { Log } from './log';
import type { Preview } from './preview';
import { reconcileShops } from './reconcile';
import { queueHeldReleases } from './release';
import { buildOf, expiredJobs, renewLostJobs, startDueRetries, type Accepted, type StartedJob } from './shop-state';

// Сборщик в работе (design.md блока 6): два потребителя и два таймера. Таймеры — только на сбоях (владелец 08.10:
// «я хочу на событийность упираться»): раз в секунду — повторы, у которых прошла пауза, и задания с истёкшим замком;
// раз в час — сверка ключей (Св-3 А). Склейка таймеров не держит: её делает строка магазина.

export interface RuntimeDeps extends BuilderDeps {
  broker: Broker;
  themeIds: readonly string[];
  // Мест для одновременных сборок (на dev — 1, раздел 4). Событиям хватает одного: приём — две записи в базу.
  slots: number;
  reconcileMs: number;
  // Сигнал превью на каждое принятое событие (design.md, раздел 4, Св-2).
  preview?: Preview;
}

export interface Runtime {
  stop: () => void;
}

const SWEEP_MS = 1_000;
const EVENT_PREFETCH = 1;
const LEASE_EXPIRED = 'замок истёк: сборщик не закончил сборку';

// Задание — в очередь сборок с приоритетом из строки магазина.
export const enqueueVia =
  (broker: Broker, log: Log) =>
  async (job: StartedJob): Promise<void> => {
    await broker.publishJob({ siteId: job.siteId, build: job.build }, job.priority);
    log('job-queued', { shopId: job.siteId, buildId: job.build, priority: job.priority });
  };

// Повторять задачу через ms после конца прошлого прогона: прогоны не накладываются. Ошибка — в журнал, не стоп.
export function every(ms: number, task: () => Promise<unknown>, log: Log): () => void {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  const run = async (): Promise<void> => {
    try {
      await task();
    } catch (error) {
      log('timer-failed', { error: errorText(error) });
    }
    if (!stopped) timer = setTimeout(() => void run(), ms);
  };
  timer = setTimeout(() => void run(), ms);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

export async function sweep(deps: RuntimeDeps): Promise<void> {
  for (const job of await expiredJobs(deps.db)) await settle(deps, job, LEASE_EXPIRED);
  const due = [...(await startDueRetries(deps.db, deps.shopState)), ...(await renewLostJobs(deps.db, deps.shopState))];
  for (const job of due) await deps.enqueue(job);
  // Место выпуска ставит конец сборки; здесь — на случай, если сборщик умер между концом сборки и постановкой.
  await queueHeldReleases(deps);
}

// Публикация из site-gen ждёт номер сборки (StorefrontHandoff.requestBuild) — ответ после записи в строку магазина и
// постановки задания. Ответ не ушёл (site-gen уже не ждёт) — только строка журнала: событие принято, повторять его нельзя.
async function replyBuild(deps: RuntimeDeps, delivery: Delivery, accepted: Accepted[]): Promise<void> {
  if (delivery.replyTo === undefined) return;
  const build = accepted.map(buildOf).find((value) => value !== null) ?? null;
  try {
    await deps.broker.reply(delivery.replyTo, delivery.correlationId, buildReplyBody(build));
  } catch (error) {
    deps.log('reply-failed', { build, error: errorText(error) });
  }
}

export async function startRuntime(deps: RuntimeDeps): Promise<Runtime> {
  await deps.broker.consume(EVENTS_QUEUE, EVENT_PREFETCH, async (delivery) => {
    const event = parseIncoming(delivery.exchange, delivery.body, deps.clock().toISOString());
    await replyBuild(deps, delivery, await acceptIncoming(deps, event));
  });
  await deps.broker.consume(JOBS_QUEUE, deps.slots, ({ body }) => runBuildJob(deps, parseJob(body)));
  const timers = [
    every(SWEEP_MS, () => sweep(deps), deps.log),
    every(deps.reconcileMs, () => reconcileShops(deps), deps.log),
  ];
  return { stop: () => timers.forEach((stop) => stop()) };
}
