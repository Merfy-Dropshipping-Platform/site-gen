import { createS3Store, type ObjectStore } from '@merfy/storefront-storage';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { acceptSection, checkSection } from '../../src/accept';
import type { Door } from '../../src/doors';
import type { SectionFiles } from '../../src/format';
import { StoreCycleError, currentDraft, rollbackSection, sectionHistory } from '../../src/registry';
import { STACK, openPool, resetSections } from './db';

// Круг чтений своих сторов при приёме (свои сторы, 01.11): правка стора, которая через другие сторы того же автора
// читает сама себя, — отказ store-cycle, ничего не записано. У магазина круг ищется по текущим правкам его сторов, у
// расширения — по сторам того же выпуска; откат к прежней правке, которая замкнула бы круг, — StoreCycleError.
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
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

// Стор name, который читает сторы reads (полные имена); value — чтобы правки одного стора различались.
function storeFiles(name: string, reads: readonly string[], value = 0): SectionFiles {
  const uses = reads.map((read) => `store:${read}`);
  return {
    'section.json': JSON.stringify({ sdk: 1, name, kind: 'store', title: name, uses }),
    'script.ts': `import { defineStore } from '@merfy/shell';\nexport default defineStore({ value: ${value} });\n`,
  };
}

const SHOP_DOOR: Door = { author: 'shop', shopId: SHOP };

describe('круг чтений сторов — отказ приёма', () => {
  it('магазин: b читает a, a читает b — отказ store-cycle с путём; правки a нет', async () => {
    const deps = { db, store };
    expect((await acceptSection(deps, SHOP_DOOR, storeFiles('b', ['shop:a']))).status).toBe('accepted');
    const refused = await acceptSection(deps, SHOP_DOOR, storeFiles('a', ['shop:b']));
    expect(refused).toEqual({
      status: 'refused',
      problems: [
        {
          code: 'store-cycle',
          file: 'section.json',
          line: null,
          column: null,
          message: 'стор shop:a читает сам себя по кругу: shop:a → shop:b → shop:a — убери одно из этих чтений из uses',
        },
      ],
    });
    expect(await currentDraft(db, SHOP, 'shop:a')).toBeNull();
  }, 60_000);

  // Проверка без записи (POST /sections/check) говорит то же, что сохранение: автор и MCP идут check → save.
  it('проверка круга — тот же отказ store-cycle, что у сохранения; ничего не записано; без круга — ok', async () => {
    const deps = { db, store };
    expect((await acceptSection(deps, SHOP_DOOR, storeFiles('b', ['shop:a']))).status).toBe('accepted');
    const files = storeFiles('a', ['shop:b']);
    const checked = await checkSection({ db }, SHOP_DOOR, files);
    const saved = await acceptSection(deps, SHOP_DOOR, files);
    expect(checked).toEqual({ ok: false, problems: saved.status === 'refused' ? saved.problems : [] });
    expect(checked.ok ? [] : checked.problems.map((item) => item.code)).toEqual(['store-cycle']);
    expect(await currentDraft(db, SHOP, 'shop:a')).toBeNull();
    expect((await checkSection({ db }, SHOP_DOOR, storeFiles('a', []))).ok).toBe(true);
  }, 60_000);

  it('стор сам себя — отказ; цепочка без круга и правка, которая круг разрывает, — принимаются', async () => {
    const deps = { db, store };
    const self = await acceptSection(deps, SHOP_DOOR, storeFiles('a', ['shop:a']));
    expect(self.status === 'refused' ? self.problems.map((item) => item.code) : []).toEqual(['store-cycle']);
    expect((await acceptSection(deps, SHOP_DOOR, storeFiles('c', []))).status).toBe('accepted');
    expect((await acceptSection(deps, SHOP_DOOR, storeFiles('b', ['shop:c']))).status).toBe('accepted');
    expect((await acceptSection(deps, SHOP_DOOR, storeFiles('a', ['shop:b']))).status).toBe('accepted');
    expect((await acceptSection(deps, SHOP_DOOR, storeFiles('b', [], 1))).status).toBe('accepted');
    expect((await acceptSection(deps, SHOP_DOOR, storeFiles('c', ['shop:a'], 1))).status).toBe('accepted');
  }, 60_000);

  it('расширение: круг — по сторам того же выпуска; другой выпуск круга не замыкает', async () => {
    const deps = { db, store };
    const v1: Door = { author: 'extension', extension: 'popups', release: '0.1.0' };
    const v2: Door = { author: 'extension', extension: 'popups', release: '0.2.0' };
    expect((await acceptSection(deps, v1, storeFiles('seen', ['popups:shown']))).status).toBe('accepted');
    const refused = await acceptSection(deps, v1, storeFiles('shown', ['popups:seen']));
    expect(refused.status === 'refused' ? refused.problems.map((item) => item.code) : []).toEqual(['store-cycle']);
    expect((await acceptSection(deps, v2, storeFiles('shown', ['popups:seen']))).status).toBe('accepted');
  }, 60_000);

  it('откат к правке, которая замкнула бы круг, — StoreCycleError; текущая правка остаётся', async () => {
    const deps = { db, store };
    expect((await acceptSection(deps, SHOP_DOOR, storeFiles('a', ['shop:b']))).status).toBe('accepted');
    expect((await acceptSection(deps, SHOP_DOOR, storeFiles('a', [], 1))).status).toBe('accepted');
    expect((await acceptSection(deps, SHOP_DOOR, storeFiles('b', ['shop:a']))).status).toBe('accepted');
    const [first] = await sectionHistory(db, SHOP, 'shop:a');
    const rollback = rollbackSection(db, SHOP, 'shop:a', first?.id ?? '');
    await expect(rollback).rejects.toBeInstanceOf(StoreCycleError);
    await expect(rollback).rejects.toMatchObject({ cycle: ['shop:a', 'shop:b', 'shop:a'] });
    expect((await currentDraft(db, SHOP, 'shop:a'))?.id).not.toBe(first?.id);
  }, 60_000);
});
