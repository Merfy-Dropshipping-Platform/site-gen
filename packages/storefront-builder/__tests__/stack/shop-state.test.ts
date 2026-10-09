import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  acceptEvent,
  claimJob,
  expiredJobs,
  finishFailure,
  finishSuccess,
  renewLostJobs,
  startDueRetries,
  type ShopStateOptions,
  type StartedJob,
} from '../../src/shop-state';
import { openPool, shopRow, wait } from './stack';

// Строка магазина на настоящем Postgres: условные UPDATE … RETURNING под гонкой, «ещё раз», лестница повторов.
let db: Pool;
beforeAll(() => {
  db = openPool();
});
afterAll(() => db.end());

const OPTIONS: ShopStateOptions = { leaseMs: 60_000, retryDelaysMs: [100, 200] };
const AT = '2026-10-08T10:00:00.000Z';
const event = (siteId: string, priority = 2, eventAt = AT) => ({ siteId, priority, eventAt });

async function started(siteId: string, options = OPTIONS): Promise<StartedJob> {
  const accepted = await acceptEvent(db, event(siteId), options);
  if (accepted.outcome !== 'started') throw new Error('ожидалась сборка сразу');
  return { siteId: accepted.siteId, build: accepted.build, priority: accepted.priority };
}

describe('событие: магазин свободен — сборка сразу, занят — склейка', () => {
  it('20 событий разом по свободному магазину — одно задание, остальные 19 едут в него', async () => {
    const siteId = randomUUID();
    const results = await Promise.all(Array.from({ length: 20 }, () => acceptEvent(db, event(siteId), OPTIONS)));
    expect(results.filter((result) => result.outcome === 'started')).toHaveLength(1);
    expect(await shopRow(db, siteId)).toMatchObject({ state: 'busy', events: 20, pending: 0 });
  });

  it('номер сборки — не меньше текущего времени в мс и растёт', async () => {
    const before = Date.now();
    const job = await started(randomUUID());
    expect(job.build).toBeGreaterThanOrEqual(before);
  });

  it('событие во время сборки — «ещё раз»: после успеха сразу следующее задание с бо́льшим номером', async () => {
    const job = await started(randomUUID());
    expect(await claimJob(db, job, OPTIONS.leaseMs)).toMatchObject({ build: job.build, events: 1 });
    const later = await Promise.all([1, 2, 3].map(() => acceptEvent(db, event(job.siteId, 3), OPTIONS)));
    expect(later.map((result) => result.outcome)).toEqual(['coalesced', 'coalesced', 'coalesced']);
    expect(await shopRow(db, job.siteId)).toMatchObject({ state: 'busy', events: 1, pending: 3 });
    const next = await finishSuccess(db, job, OPTIONS);
    expect(next).toMatchObject({ state: 'busy', siteId: job.siteId, priority: 3 });
    expect(next?.state === 'busy' && next.build > job.build).toBe(true);
    expect(await shopRow(db, job.siteId)).toMatchObject({ events: 3, pending: 0 });
  });

  it('без событий во время сборки — после успеха магазин свободен', async () => {
    const job = await started(randomUUID());
    await claimJob(db, job, OPTIONS.leaseMs);
    expect(await finishSuccess(db, job, OPTIONS)).toEqual({ state: 'idle' });
    expect(await shopRow(db, job.siteId)).toMatchObject({ state: 'idle', events: 0 });
  });
});

describe('задание: взять можно один раз', () => {
  it('чужой номер или уже взятое — null; замок истёк — можно взять снова', async () => {
    const job = await started(randomUUID(), { ...OPTIONS, leaseMs: 150 });
    expect(await claimJob(db, { ...job, build: job.build - 1 }, 150)).toBeNull();
    expect(await claimJob(db, job, 150)).not.toBeNull();
    expect(await claimJob(db, job, 150)).toBeNull();
    await wait(250);
    expect(await claimJob(db, job, 150)).not.toBeNull();
  });

  it('конец сборки с устаревшим номером ничего не пишет', async () => {
    const job = await started(randomUUID());
    expect(await finishSuccess(db, { ...job, build: job.build + 1 }, OPTIONS)).toBeNull();
    expect(await shopRow(db, job.siteId)).toMatchObject({ state: 'busy' });
  });

  it('сборка с истёкшим замком — в expiredJobs', async () => {
    const job = await started(randomUUID());
    await claimJob(db, job, 50);
    await wait(120);
    expect(await expiredJobs(db)).toContainEqual(job);
  });

  it('задание, которое за срок замка никто не взял, — снова в очередь с тем же номером', async () => {
    const job = await started(randomUUID(), { ...OPTIONS, leaseMs: 50 });
    await wait(120);
    expect(await expiredJobs(db)).not.toContainEqual(job);
    expect(await renewLostJobs(db, OPTIONS)).toContainEqual(job);
    expect(await renewLostJobs(db, OPTIONS)).not.toContainEqual(job);
  });
});

describe('повторы: три запуска, потом «остановлено»', () => {
  it('упала — повтор через паузу; упала трижды — остановлено; новое событие запускает заново', async () => {
    const first = await started(randomUUID());
    expect(await finishFailure(db, first, 'снимок не получен', OPTIONS)).toEqual({ state: 'retrying', attempt: 1 });
    expect(await startDueRetries(db, OPTIONS)).not.toContainEqual(expect.objectContaining({ siteId: first.siteId }));
    await acceptEvent(db, event(first.siteId), OPTIONS);
    await wait(150);
    const second = (await startDueRetries(db, OPTIONS)).find((job) => job.siteId === first.siteId);
    expect(second?.build).toBeGreaterThan(first.build);
    expect(await shopRow(db, first.siteId)).toMatchObject({ state: 'busy', events: 2, pending: 0 });
    const secondJob = second ?? first;
    expect(await finishFailure(db, secondJob, 'снова', OPTIONS)).toEqual({ state: 'retrying', attempt: 2 });
    await wait(250);
    const third = (await startDueRetries(db, OPTIONS)).find((job) => job.siteId === first.siteId) ?? first;
    expect(await finishFailure(db, third, 'в третий раз', OPTIONS)).toEqual({ state: 'stopped', attempt: 3 });
    expect(await shopRow(db, first.siteId)).toMatchObject({ state: 'stopped', error: 'в третий раз' });
    expect(await acceptEvent(db, event(first.siteId), OPTIONS)).toMatchObject({ outcome: 'started' });
    expect(await shopRow(db, first.siteId)).toMatchObject({ state: 'busy', attempt: 0, error: null });
  });
});
