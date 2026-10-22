import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { acceptSection, readSectionFolder, type Door } from '@merfy/storefront-sections';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recordRenderErrors } from '../../src/section-error-store';
import { openHarness, type Harness } from './builder';
import { insertSite } from './stack';

// Секции, упавшие при рендере на сервере (блок 2 «Секций и SDK», «Решил сам» п. 8): строка таблицы
// storefront_section_error со стадией рендера; в script_hash — хеш модуля рендера.
const BROKEN = fileURLToPath(new URL('../../../storefront-sections/fixtures/broken', import.meta.url));

let harness: Harness;

async function accept(door: Door, folder: string): Promise<void> {
  const result = await acceptSection({ db: harness.db, store: harness.store }, door, await readSectionFolder(folder));
  if (result.status === 'refused')
    throw new Error(`${folder}: ${result.problems.map((item) => item.message).join('; ')}`);
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

beforeAll(() => {
  harness = openHarness();
});

afterAll(async () => {
  await harness.close();
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
});
