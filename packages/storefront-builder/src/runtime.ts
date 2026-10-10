import { acceptIncoming } from './accept';
import { EVENTS_QUEUE, JOBS_QUEUE, type Broker, type Delivery, type Handler } from './broker';
import { runBuildJob, settle, type BuilderDeps, type RunningBuild } from './build-job';
import { errorText } from './errors';
import { buildReplyBody, parseIncoming, parseJob } from './events';
import type { Log } from './log';
import type { Preview } from './preview';
import { reconcileShops } from './reconcile';
import { queueHeldReleases } from './release';
import {
  buildOf,
  expiredJobs,
  interruptBuild,
  renewLostJobs,
  startDueRetries,
  type Accepted,
  type StartedJob,
} from './shop-state';

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
  // Только таймеры — сборщик «умер»: замок идущей сборки истечёт сам (тесты перезапуска).
  stop: () => void;
  // Штатная остановка (SIGTERM от Coolify): таймеры и приём сообщений — стоп, взятое ждём не дольше drainMs; сборки,
  // которых не дождались, — «прервана», замок снят (interruptBuild). Ответ — сколько сборок прервано.
  shutdown: (drainMs: number) => Promise<number>;
}

const SWEEP_MS = 1_000;
const EVENT_PREFETCH = 1;
const LEASE_EXPIRED = 'замок истёк: сборщик не закончил сборку';
const INTERRUPTED = 'остановка сборщика: сборку не дождались, задание переставлено';

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

// Обработчики в работе — их ждёт штатная остановка.
function tracker() {
  const inFlight = new Set<Promise<void>>();
  const track =
    (handler: Handler): Handler =>
    async (delivery) => {
      const work = handler(delivery);
      inFlight.add(work);
      try {
        await work;
      } finally {
        inFlight.delete(work);
      }
    };
  // Дождаться взятого, но не дольше ms: таймер не держит процесс.
  const settled = async (ms: number): Promise<void> => {
    let timer: NodeJS.Timeout | undefined;
    const limit = new Promise<void>((resolve) => (timer = setTimeout(resolve, ms)));
    await Promise.race([Promise.allSettled(inFlight), limit]);
    clearTimeout(timer);
  };
  return { track, settled };
}

// Сборки, которых остановка не дождалась: строка «interrupted» и снятый замок (shop-state.ts, interruptBuild).
async function interruptRunning(deps: RuntimeDeps, running: Set<RunningBuild>): Promise<number> {
  let interrupted = 0;
  for (const { job, steps } of [...running]) {
    const next = await interruptBuild(deps.db, { job, steps, error: INTERRUPTED, finishedAt: deps.clock() });
    if (next === null) continue;
    interrupted += 1;
    deps.log('build-interrupted', { shopId: job.siteId, buildId: job.build, nextBuildId: next });
  }
  return interrupted;
}

export async function startRuntime(deps: RuntimeDeps): Promise<Runtime> {
  const running = new Set<RunningBuild>();
  const builder = { ...deps, running };
  const { track, settled } = tracker();
  await deps.broker.consume(
    EVENTS_QUEUE,
    EVENT_PREFETCH,
    track(async (delivery) => {
      const event = parseIncoming(delivery.exchange, delivery.body, deps.clock().toISOString());
      await replyBuild(deps, delivery, await acceptIncoming(deps, event));
    }),
  );
  await deps.broker.consume(
    JOBS_QUEUE,
    deps.slots,
    track(({ body }) => runBuildJob(builder, parseJob(body))),
  );
  const timers = [
    every(SWEEP_MS, () => sweep(deps), deps.log),
    every(deps.reconcileMs, () => reconcileShops(deps), deps.log),
  ];
  const stop = () => timers.forEach((stopTimer) => stopTimer());
  const shutdown = async (drainMs: number): Promise<number> => {
    stop();
    await deps.broker.pause();
    await settled(drainMs);
    return interruptRunning(deps, running);
  };
  return { stop, shutdown };
}
