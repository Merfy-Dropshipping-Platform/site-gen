import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  acceptEvent,
  claimJob,
  finishSuccess,
  interruptBuild,
  startDueRetries,
  finishFailure,
  type ClaimedJob,
  type ShopStateOptions,
  type StartedJob,
} from '../../src/shop-state';
import { openPool, wait } from './stack';

// Кто нажал публикацию (drizzle/0040): автор едет вместе с событием в строке магазина — в ждущее задание или в «ещё раз» —
// и попадает в `ClaimedJob.publishedBy`, откуда его берёт аудит. Настоящий Postgres: условные UPDATE … RETURNING.
let db: Pool;
beforeAll(() => {
  db = openPool();
});
afterAll(() => db.end());

const OPTIONS: ShopStateOptions = { leaseMs: 60_000, retryDelaysMs: [100, 200] };
const AT = '2026-11-21T10:00:00.000Z';
const PUBLISH = 3;
const EDIT = 2;
const event = (siteId: string, priority: number, publishedBy?: string) => ({
  siteId,
  priority,
  eventAt: AT,
  ...(publishedBy === undefined ? {} : { publishedBy }),
});

async function started(siteId: string, priority: number, publishedBy?: string): Promise<StartedJob> {
  const accepted = await acceptEvent(db, event(siteId, priority, publishedBy), OPTIONS);
  if (accepted.outcome !== 'started') throw new Error('ожидалась сборка сразу');
  return { siteId, build: accepted.build, priority: accepted.priority };
}

async function claimed(job: StartedJob): Promise<ClaimedJob> {
  const taken = await claimJob(db, job, OPTIONS.leaseMs);
  if (taken === null) throw new Error('задание не взялось');
  return taken;
}

async function nextJob(siteId: string, after: StartedJob): Promise<ClaimedJob> {
  const next = await finishSuccess(db, after, OPTIONS);
  if (next?.state !== 'busy') throw new Error('ожидалось следующее задание');
  return claimed({ siteId, build: next.build, priority: next.priority });
}

describe('автор публикации в строке магазина', () => {
  it('публикация с автором — автор в задании; без автора — null', async () => {
    const withAuthor = await started(randomUUID(), PUBLISH, 'user-1');
    expect((await claimed(withAuthor)).publishedBy).toBe('user-1');
    const without = await started(randomUUID(), EDIT);
    expect((await claimed(without)).publishedBy).toBeNull();
  });

  it('публикация склеилась с ждущим заданием — автор позднего события, пустой не стирает прежнего', async () => {
    const siteId = randomUUID();
    await started(siteId, EDIT);
    const second = await acceptEvent(db, event(siteId, PUBLISH, 'user-1'), OPTIONS);
    expect(second.outcome).toBe('coalesced');
    await acceptEvent(db, event(siteId, PUBLISH, 'user-2'), OPTIONS);
    await acceptEvent(db, event(siteId, EDIT), OPTIONS);
    const job = await claimed({ siteId, build: second.outcome === 'coalesced' ? second.build : 0, priority: PUBLISH });
    expect(job.publishedBy).toBe('user-2');
  });

  it('публикация во время сборки — «ещё раз»: автор у следующей сборки, у идущей прежний', async () => {
    const siteId = randomUUID();
    const first = await claimed(await started(siteId, PUBLISH, 'user-1'));
    await acceptEvent(db, event(siteId, PUBLISH, 'user-2'), OPTIONS);
    expect(first.publishedBy).toBe('user-1');
    expect((await nextJob(siteId, first)).publishedBy).toBe('user-2');
  });

  it('правка без автора во время сборки — следующая сборка без автора; потом магазин свободен без автора', async () => {
    const siteId = randomUUID();
    const first = await claimed(await started(siteId, PUBLISH, 'user-1'));
    await acceptEvent(db, event(siteId, EDIT), OPTIONS);
    const next = await nextJob(siteId, first);
    expect(next.publishedBy).toBeNull();
    expect(await finishSuccess(db, next, OPTIONS)).toEqual({ state: 'idle' });
    const { rows } = await db.query('SELECT published_by, pending_published_by FROM storefront_shop WHERE site_id = $1', [
      siteId,
    ]);
    expect(rows).toEqual([{ published_by: null, pending_published_by: null }]);
  });

  it('сборка упала и ждёт повтора, пришла публикация — повтор идёт с её автором', async () => {
    const siteId = randomUUID();
    const first = await claimed(await started(siteId, PUBLISH, 'user-1'));
    expect(await finishFailure(db, first, 'снимок не получен', OPTIONS)).toEqual({ state: 'retrying', attempt: 1 });
    await acceptEvent(db, event(siteId, PUBLISH, 'user-2'), OPTIONS);
    await wait(150);
    const retry = (await startDueRetries(db, OPTIONS)).find((job) => job.siteId === siteId);
    expect((await claimed(retry ?? first)).publishedBy).toBe('user-2');
  });

  it('повтор без новых событий — автор прежний', async () => {
    const siteId = randomUUID();
    const first = await claimed(await started(siteId, PUBLISH, 'user-1'));
    await finishFailure(db, first, 'снимок не получен', OPTIONS);
    await wait(150);
    const retry = (await startDueRetries(db, OPTIONS)).find((job) => job.siteId === siteId);
    expect((await claimed(retry ?? first)).publishedBy).toBe('user-1');
  });

  it('штатная остановка сборщика — заменившее задание сохраняет автора, а ждущая публикация его заменяет', async () => {
    const kept = await claimed(await started(randomUUID(), PUBLISH, 'user-1'));
    const keptBuild = await interruptBuild(db, { job: kept, steps: {}, error: 'SIGTERM', finishedAt: new Date() });
    expect((await claimed({ siteId: kept.siteId, build: keptBuild ?? 0, priority: PUBLISH })).publishedBy).toBe('user-1');

    const replaced = await claimed(await started(randomUUID(), PUBLISH, 'user-1'));
    await acceptEvent(db, event(replaced.siteId, PUBLISH, 'user-2'), OPTIONS);
    const build = await interruptBuild(db, { job: replaced, steps: {}, error: 'SIGTERM', finishedAt: new Date() });
    expect((await claimed({ siteId: replaced.siteId, build: build ?? 0, priority: PUBLISH })).publishedBy).toBe('user-2');
  });
});
