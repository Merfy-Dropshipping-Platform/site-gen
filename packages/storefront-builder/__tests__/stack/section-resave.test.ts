import { fileURLToPath } from 'node:url';
import { hashOf } from '@merfy/storefront-build';
import {
  acceptSection,
  currentDraft,
  publishDrafts,
  readSectionFolder,
  visibleSections,
  type SectionFiles,
} from '@merfy/storefront-sections';
import { createS3Store } from '@merfy/storefront-storage';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { reportLines, resaveSection, type ResaveDeps, type ResaveReport } from '../../src/release/section';
import { readRelease, releaseShops } from '../../src/release/store';
import { STACK, insertSite, openPool, resetBuilder } from './stack';

// Новая версия нашей секции во всех магазинах (блок 15, часть 15з) на стенде: сохранение — тот же acceptSection, что у
// мерчанта; выпуск — строка storefront_release (волны ведёт сборщик — release-waves.test.ts).
const LONG = 120_000;
const db = openPool();
const store = createS3Store(STACK.s3);
const OURS = fileURLToPath(new URL('../../../storefront-shell/sections/cart-badge', import.meta.url));
const NAME = 'shop:cart-badge';
const withText = (files: SectionFiles, text: string): SectionFiles => ({
  ...files,
  'template.astro': (files['template.astro'] ?? '').replace('Корзина', text),
});

let v1: SectionFiles;
let v2: SectionFiles;
const deps = (): ResaveDeps => ({
  db,
  store,
  contour: 'dev',
  startedBy: 'тест',
  say: () => undefined,
  read: () => Promise.resolve(v2),
  versions: () => Promise.resolve([v1]),
});
const run = (write: boolean, testShop: string | null = null): Promise<ResaveReport> =>
  resaveSection(deps(), { folder: OURS, write, testShop, theme: 'nova' });

async function save(siteId: string, files: SectionFiles, publish: boolean): Promise<void> {
  const result = await acceptSection({ db, store }, { author: 'shop', shopId: siteId }, files);
  if (result.status === 'refused') throw new Error('секция не прошла проверку');
  if (publish) await publishDrafts(db, siteId);
}

const rowCount = async (table: string): Promise<number> =>
  (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]?.n ?? -1;

let shops: Record<'a' | 'b' | 'c' | 'd' | 'e', string>;
let keys: Map<string, string>;
const actions = (report: ResaveReport): Record<string, [string, boolean]> =>
  Object.fromEntries(report.shops.map((shop) => [keys.get(shop.siteId) ?? shop.siteId, [shop.action, shop.inRelease]]));

beforeEach(async () => {
  await resetBuilder(db);
  await db.query('TRUNCATE storefront_section');
  v1 = await readSectionFolder(OURS);
  v2 = withText(v1, 'Корзина · 15з');
  const [a, b, c, e] = [await insertSite(db), await insertSite(db), await insertSite(db), await insertSite(db)];
  const d = await insertSite(db, { status: 'draft' });
  shops = { a: a.id, b: b.id, c: c.id, d: d.id, e: e.id };
  keys = new Map(Object.entries(shops).map(([key, id]) => [id, key]));
  for (const id of [a.id, b.id, c.id, d.id]) await save(id, v1, true);
  // b — мерчант поправил копию и не опубликовал; e — своя секция мерчанта с тем же именем.
  await save(b.id, withText(v1, 'Корзинка'), false);
  await save(e.id, withText(v1, 'Мой заказ'), true);
}, LONG);

afterAll(async () => {
  await db.end();
});

describe('новая версия нашей секции во всех магазинах (часть 15з)', () => {
  it(
    'сухой прогон по умолчанию: магазины и что изменится, ничего не записано',
    async () => {
      const sections = await rowCount('storefront_section');
      const report = await run(false);
      expect(report.write).toBe(false);
      expect(actions(report)).toEqual({
        a: ['update', true],
        b: ['changed', false],
        c: ['update', true],
        d: ['update', false],
        e: ['not-ours', false],
      });
      const a = report.shops.find((shop) => shop.siteId === shops.a);
      expect(a?.files).toEqual({ added: [], changed: ['template.astro'], removed: [] });
      expect([await rowCount('storefront_section'), await rowCount('storefront_release'), report.release]).toEqual([
        sections,
        0,
        null,
      ]);
      expect(reportLines(report).some((line) => line.includes('сухой прогон'))).toBe(true);
    },
    LONG,
  );

  it(
    'запись: копии — новая текущая правка, витрина прежняя до волны; выпуск section, волна 0 — тестовый',
    async () => {
      const report = await run(true, shops.c);
      expect(report.counts).toEqual({ updated: 3, pending: 0, already: 0, skipped: 2, failed: 0 });
      const next = hashOf(v2);
      const ids = [shops.a, shops.b, shops.c, shops.d, shops.e];
      const drafts = await Promise.all(ids.map((id) => currentDraft(db, id, NAME)));
      expect(drafts.map((row) => row?.sourceHash === next)).toEqual([true, false, true, true, false]);
      const live = await visibleSections(db, { shopId: shops.a, extensions: [] });
      expect(live.find((row) => row.name === NAME)?.sourceHash).toBe(hashOf(v1));
      const release = await readRelease(db, report.release?.id ?? 0);
      expect(release).toMatchObject({ kind: 'section', subject: NAME, toVersion: next, status: 'testing' });
      expect(release?.toHash).toBe(drafts[0]?.contentHash);
      const rows = await releaseShops(db, release?.id ?? 0);
      expect(rows.map((row) => [keys.get(row.siteId), row.wave])).toEqual([
        ['c', 0],
        ['a', 1],
      ]);
    },
    LONG,
  );

  it(
    'повтор записи безопасен: строк и выпусков не прибавилось, копии ждут волны',
    async () => {
      const first = await run(true);
      const sections = await rowCount('storefront_section');
      const again = await run(true);
      expect(await rowCount('storefront_section')).toBe(sections);
      expect(again.counts).toEqual({ updated: 0, pending: 3, already: 0, skipped: 2, failed: 0 });
      expect(again.release?.id).toBe(first.release?.id);
      expect(await rowCount('storefront_release')).toBe(1);
    },
    LONG,
  );

  it(
    'новая версия не прошла проверку — отказ, ничего не записано',
    async () => {
      v2 = { ...v2, 'template.astro': '<script>alert(1)</script>' };
      const sections = await rowCount('storefront_section');
      await expect(run(true)).rejects.toThrow(/не прошла проверку/);
      expect(await rowCount('storefront_section')).toBe(sections);
    },
    LONG,
  );
});
