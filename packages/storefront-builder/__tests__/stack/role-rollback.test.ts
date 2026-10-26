import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Handler } from '../../src/broker';
import type { ContentEvent } from '../../src/events';
import { roleRollback } from '../../src/role-rollback';
import { consumeSectionErrors, sectionEditErrors } from '../../src/section-error-store';
import { SECTION_ERRORS_PATTERN } from '../../src/section-errors';
import { insertSite, openPool, type SiteFields } from './stack';

// Откат секции с ролью по порогу ошибок (блок 12 «Секций и SDK», часть 12в; design.md блока 12, В12-1 А): потребитель
// очереди на базе стенда; брокер подставной — обработчик зовётся напрямую; событие пересборки и запись журнала
// платформы — в массивы. Магазины, правки и ошибки теста — свои, в конце удаляются.
let db: Pool;
const shopIds: string[] = [];
const sectionIds: string[] = [];
const AT = '2026-10-24T09:14:30.000Z';
const MESSAGE = 'cart is not defined';
const DRAWER = 'shop:cart-drawer';
const T1 = '2026-10-24T08:00:00.000Z';
const T2 = '2026-10-24T08:30:00.000Z';
const T3 = '2026-10-24T09:00:00.000Z';

beforeAll(() => {
  db = openPool();
});
afterAll(async () => {
  await db.query('DELETE FROM storefront_section_error WHERE site_id = ANY($1)', [shopIds]);
  await db.query('DELETE FROM storefront_section WHERE id = ANY($1)', [sectionIds]);
  await db.query('DELETE FROM storefront_shop WHERE site_id = ANY($1)', [shopIds]);
  await db.query('UPDATE site SET deleted_at = now() WHERE id = ANY($1)', [shopIds]);
  await db.end();
});

interface Version {
  id: string;
  hex: string;
}

interface VersionFields {
  name: string;
  role?: string;
  title?: string;
  draft?: boolean;
  published?: boolean;
  publishedAt?: string;
  createdAt: string;
}

const hex = (): string => createHash('sha256').update(randomUUID()).digest('hex');

// Магазин у сборщика: строка site (организация — для журнала платформы) и storefront_shop (без неё ошибки не пишутся).
async function insertShop(): Promise<SiteFields> {
  const site = await insertSite(db);
  shopIds.push(site.id);
  await db.query('INSERT INTO storefront_shop (site_id) VALUES ($1)', [site.id]);
  return site;
}

// Правка своей секции магазина строкой реестра; роль и заголовок — в manifest, как пишет приём (Р12а-3).
async function insertVersion(shopId: string, fields: VersionFields): Promise<Version> {
  const version = { id: randomUUID(), hex: hex() };
  sectionIds.push(version.id);
  const role = fields.role === undefined ? {} : { role: fields.role };
  const title = fields.title ?? 'Корзина-панель';
  const manifest = { sdk: 1, name: fields.name.slice('shop:'.length), kind: 'section', title, ...role };
  await db.query(
    `INSERT INTO storefront_section (id, name, kind, author, owner, release, source_hash, content_hash, manifest,
       source, template, style, script, script_hash, draft, published, published_at, created_at)
     VALUES ($1, $2, 'section', 'shop', $3, NULL, $4, $4, $5, '{}'::jsonb, '', '', 'export default {};', $4,
       $6, $7, $8, $9)`,
    [
      version.id,
      fields.name,
      shopId,
      `sha256:${version.hex}`,
      JSON.stringify(manifest),
      fields.draft ?? false,
      fields.published ?? false,
      fields.publishedAt ?? null,
      fields.createdAt,
    ],
  );
  return version;
}

// Две правки «Корзины-панели»: прежняя была на витрине, на витрине — новая.
async function twoVersions(shopId: string): Promise<[Version, Version]> {
  const first = await insertVersion(shopId, { name: DRAWER, role: 'cart-drawer', publishedAt: T1, createdAt: T1 });
  const second = await insertVersion(shopId, {
    name: DRAWER,
    role: 'cart-drawer',
    draft: true,
    published: true,
    publishedAt: T2,
    createdAt: T2,
  });
  return [first, second];
}

async function liveId(shopId: string, name: string): Promise<string | null> {
  const sql = `SELECT id FROM storefront_section WHERE author = 'shop' AND owner = $1 AND name = $2 AND published`;
  const { rows } = await db.query<{ id: string }>(sql, [shopId, name]);
  return rows.map((row) => row.id).at(0) ?? null;
}

// expect.objectContaining в значении свойства конверта — без типа, его не пропускает линтер пакета
// (no-unsafe-assignment); хелпер возвращает unknown, содержимое сверяет toEqual (правило 24.10).
const containing = (shape: Record<string, unknown>): unknown => expect.objectContaining(shape);

interface Sent {
  key: string;
  envelope: Record<string, unknown>;
}

interface Batch {
  receivedAt?: string;
  message?: string;
}

interface Harness {
  handle: (shopId: string, section: string, version: Version, n: number, batch?: Batch) => Promise<void>;
  events: ContentEvent[];
  activity: Sent[];
  logged: string[];
  // Часы сборщика и время приёма пачки по умолчанию — двигает тест.
  now: { at: string };
}

async function harness(failEvent = false): Promise<Harness> {
  const events: ContentEvent[] = [];
  const activity: Sent[] = [];
  const logged: string[] = [];
  const now = { at: AT };
  const log = (message: string): void => {
    logged.push(message);
  };
  const after = roleRollback({
    db,
    publishEvent: (event) => {
      if (failEvent) return Promise.reject(new Error('брокер недоступен'));
      events.push(event);
      return Promise.resolve();
    },
    publishActivity: (key, envelope) => {
      activity.push({ key, envelope });
      return Promise.resolve();
    },
    clock: () => new Date(now.at),
    log,
  });
  let handler: Handler | null = null;
  const consume = (_queue: string, _prefetch: number, next: Handler): Promise<void> => {
    handler = next;
    return Promise.resolve();
  };
  await consumeSectionErrors({ broker: { consume }, db, log, roles: { db, after } });
  const handle: Harness['handle'] = async (shopId, section, version, n, batch = {}) => {
    const message = batch.message ?? MESSAGE;
    const errors = Array.from({ length: n }, () => ({ section, script: version.hex, stage: 'runtime', message }));
    const data = { v: 1, shopId, receivedAt: batch.receivedAt ?? now.at, errors };
    if (handler === null) throw new Error('потребитель не подписан');
    await handler({ exchange: '', body: { pattern: SECTION_ERRORS_PATTERN, data } });
  };
  return { handle, events, activity, logged, now };
}

describe('откат секции с ролью по порогу ошибок', () => {
  it('ниже порога — ничего; пачка, которая доводит до порога, — один откат, пересборка и запись журнала', async () => {
    const site = await insertShop();
    const [first, second] = await twoVersions(site.id);
    const h = await harness();
    await h.handle(site.id, DRAWER, second, 9);
    expect([h.events, h.activity, await liveId(site.id, DRAWER)]).toEqual([[], [], second.id]);
    await h.handle(site.id, DRAWER, second, 1);
    expect(await liveId(site.id, DRAWER)).toBe(first.id);
    expect(h.events).toEqual([
      { type: 'section-rollback', siteId: site.id, eventAt: AT, source: 'storefront-section-errors' },
    ]);
    expect(h.activity).toEqual([
      {
        key: 'site.section_rolled_back',
        envelope: containing({
          category: 'site',
          action: 'section_rolled_back',
          severity: 'warning',
          organizationId: site.tenantId,
          siteId: site.id,
          payload: {
            meta: {
              section: DRAWER,
              role: 'cart-drawer',
              scriptHash: `sha256:${second.hex}`,
              errors: 10,
              stage: 'runtime',
              message: MESSAGE,
              reason: 'rolled-back',
              from: second.id,
              to: first.id,
              holder: null,
              text: `Секция «Корзина-панель» вернулась к прежней версии: в новой ошибка — ${MESSAGE}`,
            },
          },
        }),
      },
    ]);
    await h.handle(site.id, DRAWER, second, 10);
    expect([h.events.length, h.activity.length, await liveId(site.id, DRAWER)]).toEqual([1, 1, first.id]);
  });

  it('ошибки старше окна не считаются', async () => {
    const site = await insertShop();
    const [, second] = await twoVersions(site.id);
    const h = await harness();
    await h.handle(site.id, DRAWER, second, 9, { receivedAt: '2026-10-24T08:59:59.000Z' });
    await h.handle(site.id, DRAWER, second, 9);
    expect([h.events, h.activity, await liveId(site.id, DRAWER)]).toEqual([[], [], second.id]);
  });

  it('прежней правки нет — только запись журнала section_broken, один раз', async () => {
    const site = await insertShop();
    const only = await insertVersion(site.id, {
      name: DRAWER,
      role: 'cart-drawer',
      draft: true,
      published: true,
      publishedAt: T1,
      createdAt: T1,
    });
    const h = await harness();
    await h.handle(site.id, DRAWER, only, 10);
    await h.handle(site.id, DRAWER, only, 10);
    expect([h.events, await liveId(site.id, DRAWER)]).toEqual([[], only.id]);
    expect(h.activity).toEqual([
      {
        key: 'site.section_broken',
        envelope: containing({
          severity: 'critical',
          payload: {
            meta: containing({
              reason: 'no-previous',
              from: only.id,
              to: null,
              errors: 10,
              text: `В секции «Корзина-панель» ошибка — ${MESSAGE}. Прежней версии нет: исправьте секцию`,
            }),
          },
        }),
      },
    ]);
  });

  it('две пачки разом — один откат: на витрине правка перед ошибочной, не раньше', async () => {
    const site = await insertShop();
    await insertVersion(site.id, { name: DRAWER, role: 'cart-drawer', publishedAt: T1, createdAt: T1 });
    const second = await insertVersion(site.id, { name: DRAWER, role: 'cart-drawer', publishedAt: T2, createdAt: T2 });
    const third = await insertVersion(site.id, {
      name: DRAWER,
      role: 'cart-drawer',
      draft: true,
      published: true,
      publishedAt: T3,
      createdAt: T3,
    });
    const h = await harness();
    await Promise.all([h.handle(site.id, DRAWER, third, 10), h.handle(site.id, DRAWER, third, 10)]);
    expect(await liveId(site.id, DRAWER)).toBe(second.id);
    expect([h.events.length, h.activity.map((item) => item.key)]).toEqual([1, ['site.section_rolled_back']]);
  });

  it('второй переход порога через час после отката — одна запись без отката; через 25 часов — откат', async () => {
    const site = await insertShop();
    const first = await insertVersion(site.id, { name: DRAWER, role: 'cart-drawer', publishedAt: T1, createdAt: T1 });
    const second = await insertVersion(site.id, { name: DRAWER, role: 'cart-drawer', publishedAt: T2, createdAt: T2 });
    const third = await insertVersion(site.id, {
      name: DRAWER,
      role: 'cart-drawer',
      draft: true,
      published: true,
      publishedAt: T3,
      createdAt: T3,
    });
    const h = await harness();
    await h.handle(site.id, DRAWER, third, 10);
    expect(await liveId(site.id, DRAWER)).toBe(second.id);
    h.now.at = '2026-10-24T10:14:30.000Z';
    await h.handle(site.id, DRAWER, second, 10);
    h.now.at = '2026-10-24T10:20:30.000Z';
    await h.handle(site.id, DRAWER, second, 10);
    expect([await liveId(site.id, DRAWER), h.events.length]).toEqual([second.id, 1]);
    expect(h.activity.map((item) => item.key)).toEqual(['site.section_rolled_back', 'site.section_broken']);
    expect(h.activity.at(1)?.envelope.payload).toEqual({
      meta: containing({
        reason: 'cooldown',
        to: null,
        text: `В секции «Корзина-панель» ошибка — ${MESSAGE}. Прежнюю версию не вернули: секцию с этой ролью уже возвращали за последние сутки`,
      }),
    });
    h.now.at = '2026-10-25T10:14:30.000Z';
    await h.handle(site.id, DRAWER, second, 10);
    expect([await liveId(site.id, DRAWER), h.events.length, h.activity.length]).toEqual([first.id, 2, 3]);
  });

  it('роль прежней правки занята другой секцией — отката нет, запись журнала role-taken', async () => {
    const site = await insertShop();
    await insertVersion(site.id, { name: DRAWER, role: 'cart-drawer', publishedAt: T1, createdAt: T1 });
    const live = await insertVersion(site.id, {
      name: DRAWER,
      role: 'cart-drawer',
      published: true,
      publishedAt: T2,
      createdAt: T2,
    });
    await insertVersion(site.id, { name: DRAWER, draft: true, createdAt: T3 });
    await insertVersion(site.id, {
      name: 'shop:my-cart-drawer',
      role: 'cart-drawer',
      title: 'Моя корзина-панель',
      draft: true,
      createdAt: T3,
    });
    const h = await harness();
    await h.handle(site.id, DRAWER, live, 10);
    expect([h.events, await liveId(site.id, DRAWER)]).toEqual([[], live.id]);
    expect(h.activity.map((item) => item.envelope.payload)).toEqual([
      {
        meta: containing({
          reason: 'role-taken',
          holder: 'shop:my-cart-drawer',
          text: `В секции «Корзина-панель» ошибка — ${MESSAGE}. Прежнюю версию не вернули: роль cart-drawer занята секцией shop:my-cart-drawer`,
        }),
      },
    ]);
  });

  it('обычная секция — ничего, сколько бы ни было ошибок; ошибки записаны', async () => {
    const site = await insertShop();
    await insertVersion(site.id, { name: 'shop:hero', title: 'Баннер', publishedAt: T1, createdAt: T1 });
    const live = await insertVersion(site.id, {
      name: 'shop:hero',
      title: 'Баннер',
      draft: true,
      published: true,
      publishedAt: T2,
      createdAt: T2,
    });
    const h = await harness();
    await h.handle(site.id, 'shop:hero', live, 10);
    await h.handle(site.id, 'shop:hero', live, 10);
    expect([h.events, h.activity, await liveId(site.id, 'shop:hero')]).toEqual([[], [], live.id]);
    const sql = 'SELECT sum(count)::int AS total FROM storefront_section_error WHERE site_id = $1';
    expect((await db.query(sql, [site.id])).rows).toEqual([{ total: 20 }]);
  });

  it('пересборку отправить не удалось — откат остаётся, запись журнала ушла, строка журнала сборщика', async () => {
    const site = await insertShop();
    const [first, second] = await twoVersions(site.id);
    const h = await harness(true);
    await expect(h.handle(site.id, DRAWER, second, 10)).resolves.toBeUndefined();
    expect([await liveId(site.id, DRAWER), h.events, h.activity.length]).toEqual([first.id, [], 1]);
    expect(h.logged).toContain('section-rollback-publish-failed');
  });
});

describe('ошибки правок для «правок секции» (блок 14)', () => {
  it('до трёх самых частых на отпечаток скрипта, со временем последней', async () => {
    const site = await insertShop();
    const live = await insertVersion(site.id, {
      name: 'shop:hero',
      title: 'Баннер',
      draft: true,
      published: true,
      publishedAt: T1,
      createdAt: T1,
    });
    const h = await harness();
    for (const [n, message] of [
      [4, 'a'],
      [3, 'b'],
      [2, 'c'],
      [1, 'd'],
    ] as const) {
      await h.handle(site.id, 'shop:hero', live, n, { message });
    }
    const scriptHash = `sha256:${live.hex}`;
    const lastAt = '2026-10-24T09:14:00.000Z';
    expect(await sectionEditErrors(db, site.id, 'shop:hero')).toEqual([
      { scriptHash, stage: 'runtime', message: 'a', count: 4, lastAt },
      { scriptHash, stage: 'runtime', message: 'b', count: 3, lastAt },
      { scriptHash, stage: 'runtime', message: 'c', count: 2, lastAt },
    ]);
  });
});
