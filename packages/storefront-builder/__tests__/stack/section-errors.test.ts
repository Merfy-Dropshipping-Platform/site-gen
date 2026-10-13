import { createHash, randomUUID } from 'node:crypto';
import amqplib from 'amqplib';
import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SECTION_ERRORS_QUEUE, openBroker, type Broker } from '../../src/broker';
import { consumeSectionErrors, recordSectionErrors, sectionErrorSummary } from '../../src/section-error-store';
import { SECTION_ERRORS_PATTERN, parseSectionErrors } from '../../src/section-errors';
import { STACK, openPool, until } from './stack';

// Канал ошибок секций на базе стенда (блок 11, часть 4): строки storefront_section_error, автор из реестра секций
// блока 7, счёт для автостопа выпуска; потребитель — на настоящем RabbitMQ. Строки реестра и магазины, которые тест
// заводит, он же и удаляет: их видят другие тесты стенда (секции магазина, сверка сборщика).
let db: Pool;
const sectionIds: string[] = [];
const shopIds: string[] = [];

beforeAll(() => {
  db = openPool();
});
afterAll(async () => {
  await db.query('TRUNCATE storefront_section_error');
  await db.query('DELETE FROM storefront_section WHERE id = ANY($1)', [sectionIds]);
  await db.query('DELETE FROM storefront_shop WHERE site_id = ANY($1)', [shopIds]);
  await db.end();
});
beforeEach(async () => {
  await db.query('TRUNCATE storefront_section_error');
});

const hex = (): string => createHash('sha256').update(randomUUID()).digest('hex');
const AT = '2026-10-10T12:34:56.789Z';
// Имена с меткой прогона: прерванный прогон оставит строки реестра, а повтор не упрётся в уникальный индекс выпуска
// (author, owner, name, release). Тема errtest и выпуски *-errtest не совпадут ни с одной настоящей темой и версией.
const RUN = hex().slice(0, 8);
const named = (base: string): string => `${base}-${RUN}`;

interface SectionFields {
  name: string;
  author: 'platform' | 'theme' | 'shop' | 'extension';
  owner: string;
  release: string | null;
  script: string;
  createdAt?: string;
}

// Строка реестра секций (блок 7): канал читает только имя, автора, владельца, выпуск, отпечаток и время.
async function insertSection(fields: SectionFields): Promise<void> {
  const id = randomUUID();
  sectionIds.push(id);
  await db.query(
    `INSERT INTO storefront_section (id, name, kind, author, owner, release, source_hash, content_hash, manifest, source,
       template, style, script, script_hash, created_at)
     VALUES ($1, $2, 'section', $3, $4, $5, $6, $6, '{}'::jsonb, '{}'::jsonb, '', '', 'export default {}', $7, $8)`,
    [
      id,
      fields.name,
      fields.author,
      fields.owner,
      fields.release,
      `sha256:${'0'.repeat(64)}`,
      `sha256:${fields.script}`,
      fields.createdAt ?? '2026-10-10T09:00:00.000Z',
    ],
  );
}

// Магазин у сборщика (строка storefront_shop): без неё ошибки магазина не пишутся.
async function insertShop(): Promise<string> {
  const shopId = randomUUID();
  shopIds.push(shopId);
  await db.query('INSERT INTO storefront_shop (site_id) VALUES ($1)', [shopId]);
  return shopId;
}

const entry = (section: string, script: string, message = 'сломалась при запуске') => ({
  section,
  script,
  stage: 'mount',
  message,
});

const gatewayMessage = (shopId: string, errors: unknown[], receivedAt = AT) => ({
  pattern: SECTION_ERRORS_PATTERN,
  data: { v: 1, shopId, receivedAt, errors },
});

const record = (shopId: string, errors: unknown[], receivedAt = AT) =>
  recordSectionErrors(db, parseSectionErrors(gatewayMessage(shopId, errors, receivedAt)));

const ROWS_SQL = `SELECT site_id AS "shopId", section, script_hash AS "scriptHash", author, owner, release, stage, message,
  to_char(minute AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS minute, count
  FROM storefront_section_error ORDER BY minute, section, owner`;

async function rows(): Promise<Record<string, unknown>[]> {
  const result = await db.query<Record<string, unknown>>(ROWS_SQL);
  return result.rows;
}

describe('запись ошибок секций', () => {
  it('знакомый отпечаток — строка с автором, владельцем и выпуском; незнакомый не пишется', async () => {
    const shopId = await insertShop();
    const script = hex();
    await insertSection({
      name: named('errtest:scarf-colors'),
      author: 'theme',
      owner: 'errtest',
      release: '0.1.0-errtest',
      script,
    });
    const recorded = await record(shopId, [
      entry(named('errtest:scarf-colors'), script),
      entry(named('errtest:scarf-colors'), hex()),
    ]);
    expect(recorded).toEqual({ written: 1, skipped: 1 });
    expect(await rows()).toEqual([
      {
        shopId,
        section: named('errtest:scarf-colors'),
        scriptHash: `sha256:${script}`,
        author: 'theme',
        owner: 'errtest',
        release: '0.1.0-errtest',
        stage: 'mount',
        message: 'сломалась при запуске',
        minute: '2026-10-10T12:34:00.000Z',
        count: 1,
      },
    ]);
  });

  it('та же ошибка в ту же минуту — счётчик; в следующую минуту — новая строка', async () => {
    const shopId = await insertShop();
    const script = hex();
    await insertSection({
      name: named('platform:cart-badge'),
      author: 'platform',
      owner: 'platform',
      release: '0.1.0-errtest',
      script,
    });
    const errors = [entry(named('platform:cart-badge'), script)];
    await record(shopId, errors, '2026-10-10T12:34:10.000Z');
    await record(shopId, errors, '2026-10-10T12:34:50.000Z');
    await record(shopId, errors, '2026-10-10T12:35:01.000Z');
    const found = await rows();
    expect(found.map((row) => [row.minute, row.count])).toEqual([
      ['2026-10-10T12:34:00.000Z', 2],
      ['2026-10-10T12:35:00.000Z', 1],
    ]);
  });

  it('своя секция магазина — только этого магазина; тот же код в двух выпусках — последний выпуск', async () => {
    const [owner, stranger] = [await insertShop(), await insertShop()];
    const own = hex();
    const shared = hex();
    await insertSection({ name: named('shop:color-match'), author: 'shop', owner, release: null, script: own });
    await insertSection({
      name: named('errtest:hero'),
      author: 'theme',
      owner: 'errtest',
      release: '0.1.0-errtest',
      script: shared,
    });
    const later = '2026-10-10T10:00:00.000Z';
    await insertSection({
      name: named('errtest:hero'),
      author: 'theme',
      owner: 'errtest',
      release: '0.1.1-errtest',
      script: shared,
      createdAt: later,
    });
    expect(await record(stranger, [entry(named('shop:color-match'), own)])).toEqual({ written: 0, skipped: 1 });
    expect(await record(owner, [entry(named('shop:color-match'), own), entry(named('errtest:hero'), shared)])).toEqual({
      written: 2,
      skipped: 0,
    });
    const found = await rows();
    expect(found.map((row) => [row.section, row.author, row.owner, row.release])).toEqual([
      [named('errtest:hero'), 'theme', 'errtest', '0.1.1-errtest'],
      [named('shop:color-match'), 'shop', owner, null],
    ]);
  });

  it('магазина нет у сборщика — ничего не пишется', async () => {
    const script = hex();
    await insertSection({
      name: named('errtest:footer'),
      author: 'theme',
      owner: 'errtest',
      release: '0.1.0-errtest',
      script,
    });
    expect(await record(randomUUID(), [entry(named('errtest:footer'), script)])).toEqual({ written: 0, skipped: 1 });
    expect(await rows()).toEqual([]);
  });

  it('sectionErrorSummary — магазины и ошибки выпуска секции с минуты since', async () => {
    const [first, second, old] = [await insertShop(), await insertShop(), await insertShop()];
    const script = hex();
    await insertSection({
      name: named('errtest:gallery'),
      author: 'theme',
      owner: 'errtest',
      release: '0.2.0-errtest',
      script,
    });
    const errors = [entry(named('errtest:gallery'), script)];
    await record(first, errors, '2026-10-10T12:30:05.000Z');
    await record(first, [entry(named('errtest:gallery'), script, 'другая ошибка')], '2026-10-10T12:31:00.000Z');
    await record(second, errors, '2026-10-10T12:40:00.000Z');
    await record(old, errors, '2026-10-10T11:00:00.000Z');
    expect(await sectionErrorSummary(db, new Date('2026-10-10T12:30:40.000Z'))).toEqual([
      {
        author: 'theme',
        owner: 'errtest',
        release: '0.2.0-errtest',
        section: named('errtest:gallery'),
        scriptHash: `sha256:${script}`,
        shops: 2,
        errors: 3,
      },
    ]);
    expect(await sectionErrorSummary(db, new Date('2026-10-10T13:00:00.000Z'))).toEqual([]);
  });
});

describe('очередь storefront_section_errors', () => {
  let raw: amqplib.ChannelModel;
  let channel: amqplib.Channel;
  let broker: Broker;
  const lines: string[] = [];

  beforeAll(async () => {
    raw = await amqplib.connect(STACK.rabbitmqUrl);
    channel = await raw.createChannel();
    await channel.assertQueue(SECTION_ERRORS_QUEUE, { durable: true });
  });
  afterAll(() => raw.close());
  beforeEach(async () => {
    lines.length = 0;
    await channel.purgeQueue(SECTION_ERRORS_QUEUE);
    broker = openBroker(STACK.rabbitmqUrl, (message, fields) => lines.push(JSON.stringify({ message, ...fields })));
  });
  afterEach(() => broker.close());

  it('сообщение шлюза → строка в таблице; негодное — строка журнала, подтверждено', async () => {
    const shopId = await insertShop();
    const script = hex();
    await insertSection({
      name: named('errtest:reviews'),
      author: 'theme',
      owner: 'errtest',
      release: '0.1.0-errtest',
      script,
    });
    await consumeSectionErrors({
      broker,
      db,
      log: (message, fields) => lines.push(JSON.stringify({ message, ...fields })),
    });
    const body = gatewayMessage(shopId, [entry(named('errtest:reviews'), script)]);
    channel.sendToQueue(SECTION_ERRORS_QUEUE, Buffer.from(JSON.stringify({ pattern: 'storefront.other', data: {} })));
    channel.sendToQueue(SECTION_ERRORS_QUEUE, Buffer.from(JSON.stringify(body)));
    await until(async () => (await rows()).length === 1);
    await until(() => Promise.resolve(lines.some((line) => line.includes('"message":"section-errors"'))));
    expect(lines.some((line) => line.includes('"message":"message-failed"') && line.includes('"dropped":true'))).toBe(
      true,
    );
    expect(lines).toContainEqual(
      JSON.stringify({ message: 'section-errors', shopId, minute: '2026-10-10T12:34:00.000Z', written: 1, skipped: 0 }),
    );
    expect((await channel.checkQueue(SECTION_ERRORS_QUEUE)).messageCount).toBe(0);
  });
});
