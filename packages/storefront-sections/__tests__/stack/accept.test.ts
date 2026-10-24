import { fileURLToPath } from 'node:url';
import { blobKey, createS3Store, type ObjectStore } from '@merfy/storefront-storage';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { acceptSection, type AcceptDeps } from '../../src/accept';
import type { Door } from '../../src/doors';
import { readSectionFolder } from '../../src/read-folder';
import { DEFAULT_SANDBOX } from '../../src/sandbox';
import { STACK, openPool, resetSections } from './db';

// Приём целиком на стенде: база sites и MinIO. Способы сохранения — своя секция магазина и расширение — одна функция
// (п. 21). Секций платформы и тем нет (блок 1 «Секций и SDK», пп. 1, 2): наши секции магазин сохраняет как свои.
const fixture = (path: string): string => fileURLToPath(new URL(`../../fixtures/${path}`, import.meta.url));
// Исходники наших секций — «Значок корзины» и «Аналитика».
const OUR_SECTIONS = fileURLToPath(new URL('../../../storefront-shell/sections', import.meta.url));
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const DOORS = {
  shop: { author: 'shop', shopId: SHOP },
  extension: { author: 'extension', extension: 'reviews', release: '1.4.0' },
  // Выпуск расширения: та же версия с другим исходником — отказ release-changed.
  release: { author: 'extension', extension: 'scarves', release: '0.0.4' },
} satisfies Record<string, Door>;

let db: Pool;
let store: ObjectStore;

beforeAll(() => {
  db = openPool();
  store = createS3Store(STACK.s3);
});
afterAll(async () => {
  await db.end();
});
beforeEach(async () => {
  await resetSections(db);
});

const deps = (): AcceptDeps => ({ db, store });
// Процесс сборки, который падает: приём, который его позвал, ответит build-crashed.
const crashing = (): AcceptDeps => ({
  db,
  store,
  sandbox: { ...DEFAULT_SANDBOX, workerPath: fixture('workers/exit.ts') },
});
const files = (folder: string) => readSectionFolder(fixture(`sections/${folder}`));

describe('приём секции целиком', () => {
  it('способы сохранения — одна функция приёма: строка с префиксом автора, файл скрипта в storefront/blobs', async () => {
    const results = await Promise.all([
      acceptSection(deps(), DOORS.shop, await readSectionFolder(`${OUR_SECTIONS}/cart-badge`)),
      acceptSection(deps(), DOORS.release, await files('theme-scarf-colors')),
      acceptSection(deps(), DOORS.extension, await files('reviews-list')),
    ]);
    const rows = results.map((result) => (result.status === 'accepted' ? result.row : null));
    expect(rows.map((row) => [row?.name, row?.author, row?.release, row?.draft])).toEqual([
      ['shop:cart-badge', 'shop', null, true],
      ['scarves:scarf-colors', 'extension', '0.0.4', false],
      ['reviews:list', 'extension', '1.4.0', false],
    ]);
    const blobs = await Promise.all(
      rows.map((row) => store.read(blobKey(row?.scriptHash ?? `sha256:${'0'.repeat(64)}`))),
    );
    expect(blobs.map((blob) => new TextDecoder().decode(blob?.body))).toEqual(rows.map((row) => row?.script));
  });

  // Два приёма одного выпуска расширения разом: оба не нашли строку, оба собрали секцию, строку записал первый
  // (ON CONFLICT … DO NOTHING), второй сверил исходник с ней — «без изменений».
  it('два приёма одного выпуска разом: строка одна, ответы — accepted и unchanged с одним отпечатком', async () => {
    const source = await files('theme-scarf-colors');
    const results = await Promise.all([
      acceptSection(deps(), DOORS.release, source),
      acceptSection(deps(), DOORS.release, source),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['accepted', 'unchanged']);
    const hashes = results.map((result) => (result.status === 'refused' ? null : result.row.contentHash));
    expect(hashes[0]).toBe(hashes[1]);
    expect((await db.query('SELECT count(*)::int AS count FROM storefront_section')).rows).toEqual([{ count: 1 }]);
  });

  it('выпуск: тот же код повторно — «без изменений» с тем же отпечатком, без процесса сборки', async () => {
    const first = await acceptSection(deps(), DOORS.release, await files('theme-scarf-colors'));
    const again = await acceptSection(crashing(), DOORS.release, await files('theme-scarf-colors'));
    expect(again.status).toBe('unchanged');
    expect(again.status === 'unchanged' && again.row.contentHash).toBe(
      first.status === 'accepted' && first.row.contentHash,
    );
  });

  it('отказы одного вида у всех авторов: опечатка и чужой пакет — код, файл, строка, колонка; строки нет', async () => {
    const cases = Object.values(DOORS).flatMap((door) =>
      ['shop-broken', 'bad-import'].map((folder) => ({ door, folder })),
    );
    const results = await Promise.all(
      cases.map(async ({ door, folder }) => acceptSection(deps(), door, await files(folder))),
    );
    const places = results.map((result) =>
      result.status === 'refused'
        ? result.problems.map((item) => `${item.code} ${item.file}:${item.line}:${item.column}`).join(', ')
        : result.status,
    );
    const expected = ['script-invalid script.ts:3:11', 'import-forbidden script.ts:1:22'];
    expect(places).toEqual([...expected, ...expected, ...expected]);
    expect((await db.query('SELECT count(*)::int AS count FROM storefront_section')).rows).toEqual([{ count: 0 }]);
  });

  it('выпуск неизменен: та же версия с другим исходником — release-changed; новая версия — новая строка', async () => {
    const original = await files('theme-scarf-colors');
    await acceptSection(deps(), DOORS.release, original);
    const edited = { ...original, 'template.astro': '<p>Другая разметка</p>' };
    const same = await acceptSection(deps(), DOORS.release, edited);
    expect(same.status === 'refused' && same.problems.map((item) => item.code)).toEqual(['release-changed']);
    const next = await acceptSection(deps(), { ...DOORS.release, release: '0.0.5' }, edited);
    expect(next.status === 'accepted' && next.row.release).toBe('0.0.5');
  });

  it('своя секция: тот же исходник — «без изменений» без сборки, другой — новая текущая правка; глобальный скрипт — та же дверь', async () => {
    const first = await acceptSection(deps(), DOORS.shop, await files('shop-color-match'));
    const again = await acceptSection(crashing(), DOORS.shop, await files('shop-color-match'));
    const edited = { ...(await files('shop-color-match')), 'template.astro': '<p data-advice>Вторая правка</p>' };
    const second = await acceptSection(deps(), DOORS.shop, edited);
    expect([first.status, again.status, second.status]).toEqual(['accepted', 'unchanged', 'accepted']);
    expect(second.status === 'accepted' && second.row.draft).toBe(true);
    const geo = await acceptSection(
      deps(),
      { author: 'extension', extension: 'geo', release: '1.0.0' },
      await files('geo-locate'),
    );
    expect(geo.status === 'accepted' && [geo.row.name, geo.row.kind, geo.row.template]).toEqual([
      'geo:locate',
      'global',
      '',
    ]);
  });
});

// Часть 5в блока 5: приём пишет script_meta — модули SDK для ctx, части бандла (uses и действия SDK разметки) и классы
// скрипта; строка реестра отдаёт его в scriptMeta.
describe('script_meta при приёме', () => {
  const SCARF = { uses: [], parts: ['cart'], classes: ['bg-primary', 'text-primary-foreground'] };
  const REVIEWS = { uses: ['cart'], parts: ['cart'], classes: [] };

  it('«Подбор шарфа» и «Отзывы»: script_meta — в строке реестра и в базе', async () => {
    const scarf = await acceptSection(deps(), DOORS.shop, await readSectionFolder(fixture('scripts/scarf-match')));
    const reviews = await acceptSection(deps(), DOORS.extension, await files('reviews-list'));
    const metas = [scarf, reviews].map((result) => (result.status === 'accepted' ? result.row.scriptMeta : null));
    expect(metas).toEqual([SCARF, REVIEWS]);
    const stored = await db.query('SELECT name, script_meta FROM storefront_section ORDER BY name COLLATE "C"');
    expect(stored.rows).toEqual([
      { name: 'reviews:list', script_meta: REVIEWS },
      { name: 'shop:scarf-match', script_meta: SCARF },
    ]);
  });
});
