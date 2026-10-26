import { fileURLToPath } from 'node:url';
import { hashOf } from '@merfy/storefront-build';
import {
  acceptSection,
  publishDrafts,
  publishSection,
  readSectionFolder,
  type SectionFiles,
} from '@merfy/storefront-sections';
import { createS3Store, type ListedObject, type ObjectStore, type StoredObject } from '@merfy/storefront-storage';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { reportLines, resaveSection, type ResaveDeps, type ResaveReport } from '../../src/release/section';
import { STACK, insertSite, openPool, resetBuilder } from './stack';

// Ветви resaveSection, которых не касается section-resave.test.ts (часть 15з, покрытие стекового прогона): «уже на
// новой», витрина изменена мерчантом, магазин упал, «хеш правки другой», строки отчёта всех видов.
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
let mine: SectionFiles;
const deps = (over: Partial<ResaveDeps> = {}): ResaveDeps => ({
  db,
  store,
  contour: 'dev',
  startedBy: 'тест',
  say: () => undefined,
  read: () => Promise.resolve(v2),
  versions: () => Promise.resolve([v1]),
  ...over,
});
const run = (over: Partial<ResaveDeps> = {}, write = true): Promise<ResaveReport> =>
  resaveSection(deps(over), { folder: OURS, write, testShop: null, theme: 'nova' });

async function save(siteId: string, files: SectionFiles, publish: boolean): Promise<void> {
  const result = await acceptSection({ db, store }, { author: 'shop', shopId: siteId }, files);
  expect(result.status).toBe('accepted');
  if (publish) expect(await publishDrafts(db, siteId)).toContain(NAME);
}

// Хранилище, отказывающее на запись: путь «магазин упал» в resaveShop.
const failingStore = (): ObjectStore => ({
  read: (): Promise<StoredObject | null> => Promise.resolve(null),
  has: (): Promise<boolean> => Promise.resolve(false),
  write: () => Promise.reject(new Error('хранилище недоступно')),
  list: (): Promise<ListedObject[]> => Promise.resolve([]),
  remove: (): Promise<void> => Promise.resolve(),
});

beforeEach(async () => {
  await resetBuilder(db);
  await db.query('TRUNCATE storefront_section');
  v1 = await readSectionFolder(OURS);
  v2 = withText(v1, 'Корзина · cov');
  mine = withText(v1, 'Моя корзина');
}, LONG);

afterAll(async () => {
  await db.end();
});

describe('ветви новой версии нашей секции (часть 15з, стек)', () => {
  it(
    'уже на новой: текущая и витрина — новая версия; изменённая мерчантом витрина — пропуск',
    async () => {
      const [p, l] = [await insertSite(db), await insertSite(db)];
      for (const id of [p.id, l.id]) await save(id, v1, true);
      // p — после записи и публикации секции новая версия уже на витрине.
      const first = await run();
      expect(first.counts.updated).toBe(2);
      expect(await publishSection(db, p.id, NAME, hashOf(v2))).toBe('published');
      // l — мерчант изменил и опубликовал свою правку, потом вернул нашу прежнюю как черновик.
      await save(l.id, mine, false);
      expect(await publishSection(db, l.id, NAME, hashOf(mine))).toBe('published');
      await save(l.id, v1, false);
      const again = await run();
      expect(again.counts).toEqual({ updated: 0, pending: 0, already: 1, skipped: 1, failed: 0 });
      expect(again.release?.id).toBe(first.release?.id);
      const actions = new Map(again.shops.map((row) => [row.siteId, [row.action, row.inRelease]]));
      expect(actions.get(p.id)).toEqual(['already', false]);
      expect(actions.get(l.id)).toEqual(['live-changed', false]);
      const lines = reportLines(again);
      expect(lines[0]).toContain('запись');
      expect(lines.some((line) => line.startsWith(`${p.id}: already`))).toBe(true);
      expect(lines.some((line) => line.startsWith(`${l.id}: live-changed`))).toBe(true);
      expect(lines.at(-1)).toContain('"already":1');
    },
    LONG,
  );

  it(
    'магазин упал при записи — failed с текстом ошибки, выпуска нет, код отказа',
    async () => {
      const shop = await insertSite(db, { status: 'draft' });
      await save(shop.id, v1, true);
      const report = await run({ store: failingStore() });
      expect(report.counts).toEqual({ updated: 0, pending: 0, already: 0, skipped: 0, failed: 1 });
      const failed = report.shops[0];
      expect([failed?.action, failed?.inRelease, failed?.error]).toEqual([
        'failed',
        false,
        'хранилище недоступно',
      ]);
      expect(report.release).toBeNull();
      expect(reportLines(report).some((line) => line.includes('failed — хранилище недоступно'))).toBe(true);
    },
    LONG,
  );

  it(
    'хеш правки ждущего магазина другой — failed, в выпуск он не идёт',
    async () => {
      const [a, w] = [await insertSite(db), await insertSite(db)];
      await save(a.id, v1, true);
      // w — уже на новой версии как черновик, но хеш его правки не совпадает с сохранённой копией.
      await save(w.id, v2, false);
      await db.query(
        `UPDATE storefront_section SET content_hash = 'sha256:other' WHERE owner = $1 AND name = $2 AND draft`,
        [w.id, NAME],
      );
      const report = await run();
      expect(report.counts).toEqual({ updated: 1, pending: 0, already: 0, skipped: 0, failed: 1 });
      const row = report.shops.find((shop) => shop.siteId === w.id);
      expect([row?.action, row?.error, row?.inRelease]).toEqual(['failed', 'хеш правки другой', false]);
      expect(report.release).not.toBeNull();
      const inRelease = report.shops.filter((shop) => shop.inRelease).map((shop) => shop.siteId);
      expect(inRelease).toEqual([a.id]);
    },
    LONG,
  );
});
