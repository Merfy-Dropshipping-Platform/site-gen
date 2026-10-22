import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { acceptSection, readSectionFolder, type Door } from '@merfy/storefront-sections';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { acceptIncoming } from '../../src/accept';
import { runBuildJob } from '../../src/build-job';
import { recordRenderErrors } from '../../src/section-error-store';
import { extensions, liveHome, logged, openHarness, type Harness } from './builder';
import { startFakeProducts, type FakeProducts } from './fake-product';
import { insertRevision, insertSite, type SiteFields } from './stack';

// Секции, упавшие при рендере на сервере (блок 2 «Секций и SDK», «Решил сам» пп. 7, 8): сборка их пропускает и
// выкладывает страницу с соседними секциями, пишет строку журнала section-render-failed и строку таблицы
// storefront_section_error со стадией рендера; в script_hash — хеш модуля рендера.
const SECTIONS = fileURLToPath(new URL('../../../storefront-sections/fixtures/sections', import.meta.url));
const BROKEN = fileURLToPath(new URL('../../../storefront-sections/fixtures/broken', import.meta.url));
const instance = (id: string, section: string, settings: Record<string, string> = {}) => ({ id, section, settings });

let harness: Harness;
let products: FakeProducts;

const labelOf = (site: SiteFields): string => (site.publicUrl ?? '').split('.')[0];

async function accept(door: Door, folder: string): Promise<void> {
  const result = await acceptSection({ db: harness.db, store: harness.store }, door, await readSectionFolder(folder));
  if (result.status === 'refused')
    throw new Error(`${folder}: ${result.problems.map((item) => item.message).join('; ')}`);
}

async function publishAndBuild(siteId: string): Promise<void> {
  await acceptIncoming(harness.deps, {
    owner: 'site',
    siteId,
    type: 'merchant-publish',
    eventAt: new Date().toISOString(),
  });
  const index = harness.queued.findIndex((job) => job.siteId === siteId);
  const [job] = harness.queued.splice(index, 1);
  await runBuildJob(harness.deps, job);
}

// Хеш модуля рендера своей секции магазина — как его записало сохранение секции.
async function renderHashOf(siteId: string, name: string): Promise<string> {
  const sql = "SELECT render_hash FROM storefront_section WHERE author = 'shop' AND owner = $1 AND name = $2";
  const { rows } = await harness.db.query<{ render_hash: string }>(sql, [siteId, name]);
  return rows[0]?.render_hash ?? '';
}

const ROWS_SQL = `SELECT section, script_hash AS "scriptHash", author, owner, release, stage, message, count
  FROM storefront_section_error WHERE site_id = $1 ORDER BY section, stage`;

async function errorRows(siteId: string): Promise<Record<string, unknown>[]> {
  const { rows } = await harness.db.query<Record<string, unknown>>(ROWS_SQL, [siteId]);
  return rows;
}

beforeAll(async () => {
  harness = openHarness();
  products = await startFakeProducts();
}, 120_000);

afterAll(async () => {
  await products.close();
  await harness.close();
});

beforeEach(() => {
  extensions.answer = { success: true, data: [] };
});

describe('ошибки рендера секций', () => {
  it('recordRenderErrors: одинаковые отказы — одна строка со счётчиком; незнакомый хеш не пишется', async () => {
    const site = await insertSite(harness.db);
    await harness.db.query('INSERT INTO storefront_shop (site_id) VALUES ($1)', [site.id]);
    await accept({ author: 'shop', shopId: site.id }, `${BROKEN}/heading-letter`);
    const hash = await renderHashOf(site.id, 'shop:heading-letter');
    const failure = {
      id: 'letter-1',
      section: 'shop:heading-letter',
      hash,
      stage: 'render' as const,
      message: 'а'.repeat(400),
    };
    const batch = {
      shopId: site.id,
      minute: '2026-10-22T10:15:00.000Z',
      failures: [failure, { ...failure, id: 'letter-2' }, { ...failure, hash: `sha256:${'0'.repeat(64)}` }],
    };
    expect(await recordRenderErrors(harness.db, batch)).toEqual({ written: 1, skipped: 1 });
    expect(await errorRows(site.id)).toEqual([
      {
        section: 'shop:heading-letter',
        scriptHash: hash,
        author: 'shop',
        owner: site.id,
        release: null,
        stage: 'render',
        message: 'а'.repeat(300),
        count: 2,
      },
    ]);
    expect(await recordRenderErrors(harness.db, { ...batch, failures: [] })).toEqual({ written: 0, skipped: 0 });
    expect(await recordRenderErrors(harness.db, { ...batch, shopId: randomUUID() })).toEqual({
      written: 0,
      skipped: 2,
    });
  });

  it('сборка пропускает упавшие секции: страница выложена, соседняя на месте, журнал и таблица ошибок', async () => {
    const site = await insertSite(harness.db);
    await insertRevision(harness.db, site.id, {
      sections: {
        home: [
          instance('hero-1', 'shop:hero'),
          instance('letter-1', 'shop:heading-letter', { heading: '' }),
          instance('words-1', 'shop:long-output', { count: '1000000' }),
          instance('grid-1', 'shop:slow-grid', { count: '100000' }),
        ],
      },
    });
    await accept({ author: 'shop', shopId: site.id }, `${SECTIONS}/hero`);
    for (const name of ['heading-letter', 'long-output', 'slow-grid'])
      await accept({ author: 'shop', shopId: site.id }, `${BROKEN}/${name}`);
    await publishAndBuild(site.id);
    expect(logged(harness.lines, 'build-finish').at(-1)).toMatchObject({ shopId: site.id, outcome: 'live' });
    const home = await liveHome(harness.store, labelOf(site));
    expect(home).toContain('data-section-id="hero-1"');
    for (const id of ['letter-1', 'words-1', 'grid-1']) expect(home).not.toContain(`data-section-id="${id}"`);
    const failed = logged(harness.lines, 'section-render-failed').filter((line) => line.shopId === site.id);
    expect(failed.map((line) => [line.sectionId, line.stage])).toEqual([
      ['letter-1', 'render'],
      ['words-1', 'render-output'],
      ['grid-1', 'render-timeout'],
    ]);
    const rows = await errorRows(site.id);
    expect(rows.map((row) => [row.section, row.stage, row.author, row.owner, row.release, row.count])).toEqual([
      ['shop:heading-letter', 'render', 'shop', site.id, null, 1],
      ['shop:long-output', 'render-output', 'shop', site.id, null, 1],
      ['shop:slow-grid', 'render-timeout', 'shop', site.id, null, 1],
    ]);
    expect(rows[0]?.scriptHash).toBe(await renderHashOf(site.id, 'shop:heading-letter'));
  }, 60_000);
});
