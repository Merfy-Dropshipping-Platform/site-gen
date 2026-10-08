import { randomUUID } from 'node:crypto';
import * as amqp from 'amqp-connection-manager';
import type { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import type { Channel, ConsumeMessage } from 'amqplib';
import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CONTENT_EXCHANGE } from '../../src/events';
import { enqueueVia, startRuntime, type Runtime } from '../../src/runtime';
import {
  acceptEvent,
  buildOf,
  claimJob,
  finishFailure,
  finishSuccess,
  startDueRetries,
  type Accepted,
  type ShopStateOptions,
  type StartedJob,
} from '../../src/shop-state';
import { openHarness, render, type Harness } from './builder';
import { startFakeProducts, type FakeProducts } from './fake-product';
import { STACK, insertSite, openPool, resetBuilder, until, wait } from './stack';

// Номер сборки в ответе публикации (design.md блока 6, раздел 4: «номер сборки сквозной: выдаётся при постановке
// задания»). Публикация магазина новой темы ждёт ответа сборщика с номером сборки, в которую вошла: магазин свободен —
// новый номер; задание в очереди — его номер; сборка идёт — номер следующей, он в резерве (next_build).
let db: Pool;
let products: FakeProducts;
beforeAll(async () => {
  db = openPool();
  products = await startFakeProducts();
});
afterAll(async () => {
  await products.close();
  await db.end();
});
beforeEach(async () => {
  render.delayMs = 0;
  await resetBuilder(db);
});

const OPTIONS: ShopStateOptions = { leaseMs: 60_000, retryDelaysMs: [100, 200] };
const event = (siteId: string) => ({ siteId, priority: 3, eventAt: new Date().toISOString() });

function startedJob(accepted: Accepted): StartedJob {
  if (accepted.outcome !== 'started') throw new Error('ожидалась сборка сразу');
  return { siteId: accepted.siteId, build: accepted.build, priority: accepted.priority };
}

describe('строка магазина: номер сборки известен при приёме события', () => {
  it('свободен — новый номер; задание в очереди — его номер; сборка идёт — номер следующей, и она его берёт', async () => {
    const siteId = randomUUID();
    const job = startedJob(await acceptEvent(db, event(siteId), OPTIONS));
    expect(buildOf(await acceptEvent(db, event(siteId), OPTIONS))).toBe(job.build);
    await claimJob(db, job, OPTIONS.leaseMs);
    const during = buildOf(await acceptEvent(db, event(siteId), OPTIONS));
    expect(during).toBeGreaterThan(job.build);
    expect(buildOf(await acceptEvent(db, event(siteId), OPTIONS))).toBe(during);
    expect(await finishSuccess(db, job, OPTIONS)).toMatchObject({ state: 'busy', build: during });
  });

  it('сборка упала — повтор берёт обещанный номер', async () => {
    const siteId = randomUUID();
    const job = startedJob(await acceptEvent(db, event(siteId), OPTIONS));
    await claimJob(db, job, OPTIONS.leaseMs);
    const promised = buildOf(await acceptEvent(db, event(siteId), OPTIONS));
    await finishFailure(db, job, 'товары не пришли', OPTIONS);
    await wait(150);
    expect(await startDueRetries(db, OPTIONS)).toEqual([{ siteId, build: promised, priority: 3 }]);
  });
});

describe('сборщик целиком: ответ на публикацию', () => {
  let harness: Harness;
  let runtime: Runtime;
  let connection: AmqpConnectionManager;
  let channel: ChannelWrapper;
  const replies = new Map<string, (body: unknown) => void>();

  beforeAll(async () => {
    harness = openHarness();
    harness.deps.enqueue = enqueueVia(harness.broker, harness.deps.log);
    runtime = await startRuntime(harness.deps);
    // Как StorefrontHandoff в site-gen: канал с подтверждениями и прямой ответ RabbitMQ на нём же.
    connection = amqp.connect([STACK.rabbitmqUrl]);
    channel = connection.createChannel({
      setup: async (ch: Channel) => {
        await ch.consume('amq.rabbitmq.reply-to', (msg: ConsumeMessage | null) => answer(msg), { noAck: true });
      },
    });
    await channel.waitForConnect();
  });
  afterAll(async () => {
    runtime.stop();
    await channel.close();
    await connection.close();
    await harness.close();
  });
  afterEach(() => replies.clear());

  function answer(msg: ConsumeMessage | null): void {
    const properties: { correlationId?: unknown } = msg?.properties ?? {};
    const reply = replies.get(String(properties.correlationId));
    if (msg !== null && reply !== undefined) reply(JSON.parse(msg.content.toString('utf8')));
  }

  async function publish(siteId: string): Promise<unknown> {
    const correlationId = randomUUID();
    const reply = new Promise((resolve) => replies.set(correlationId, resolve));
    const body = { v: 1, type: 'merchant-publish', siteId, eventAt: new Date().toISOString(), source: 'test' };
    const options = { replyTo: 'amq.rabbitmq.reply-to', correlationId, persistent: true };
    await channel.publish(CONTENT_EXCHANGE, 'merchant-publish', Buffer.from(JSON.stringify(body)), options);
    return reply;
  }

  async function liveBuilds(siteId: string): Promise<number[]> {
    const sql = `SELECT build::float8 AS build FROM storefront_build WHERE site_id = $1 AND outcome = 'live'`;
    return (await db.query<{ build: number }>(sql, [siteId])).rows.map((row) => row.build);
  }

  it('магазин новой темы — ответ с номером, и сборка с этим номером у покупателя', async () => {
    const site = await insertSite(db, { status: 'draft' });
    const { build } = z.object({ v: z.literal(1), build: z.int() }).parse(await publish(site.id));
    await until(async () => (await liveBuilds(site.id)).length === 1);
    expect(await liveBuilds(site.id)).toEqual([build]);
  });

  it('магазин нынешней темы — ответ без номера: его собирает старый конвейер', async () => {
    const site = await insertSite(db, { themeId: 'rose' });
    expect(await publish(site.id)).toEqual({ v: 1, build: null });
  });
});
