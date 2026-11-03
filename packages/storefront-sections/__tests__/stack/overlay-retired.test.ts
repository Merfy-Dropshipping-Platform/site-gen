import { sha256 } from '@merfy/storefront-build';
import { createS3Store, type ObjectStore } from '@merfy/storefront-storage';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { acceptSection, checkSection } from '../../src/accept';
import { doorFields, type Door } from '../../src/doors';
import { hasOverlayWindow, saveDraft, type NewSection } from '../../src/registry';
import { STACK, openPool, resetSections } from './db';

// Три блока (03.11): новая секция без роли не объявляет группу overlay; секция, принятая с ней раньше, остаётся такой.
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const OTHER_SHOP = '0b6f3c2e-8a41-4d5f-9c7e-1a2b3c4d5e6f';
const DOOR: Door = { author: 'shop', shopId: SHOP };
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

const TEMPLATE = (text: string): string => `<div class="p-4"><h2>${text}</h2></div>`;
const folder = (name: string, groups: string[], text = 'Скидка'): Record<string, string> => ({
  'section.json': JSON.stringify({ sdk: 1, name, kind: 'section', title: name, groups }),
  'template.astro': TEMPLATE(text),
});

// Секция, принятая до трёх блоков: строка реестра с группой overlay и без роли.
function legacy(name: string, shopId = SHOP): NewSection {
  const template = TEMPLATE('Скидка');
  return {
    door: doorFields({ author: 'shop', shopId }),
    section: {
      name: `shop:${name}`,
      manifest: { sdk: 1, name, kind: 'section', title: name, settings: [], groups: ['overlay'] },
      template,
      render: null,
      script: null,
      warnings: [],
      scriptMeta: { uses: [], parts: [], classes: [] },
    },
    sourceHash: sha256(`source:${name}`),
    contentHash: sha256(`content:${name}`),
    renderHash: null,
    scriptHash: null,
    tokenOrder: null,
    source: { 'template.astro': template },
  };
}

describe('группа overlay у новой секции без роли', () => {
  it('приём: новая секция с overlay — отказ overlay-retired, строки в реестре нет', async () => {
    const result = await acceptSection({ db, store }, DOOR, folder('promo', ['overlay']));
    expect(result.status).toBe('refused');
    if (result.status !== 'refused') return;
    expect(result.problems.map((item) => item.code)).toEqual(['overlay-retired']);
    expect(result.problems[0]?.message).toContain('ctx.behavior("dialog")');
    expect(await hasOverlayWindow(db, doorFields(DOOR), 'shop:promo')).toBe(false);
  }, 60_000);

  it('проверка без сохранения даёт тот же отказ', async () => {
    const result = await checkSection({ db }, DOOR, folder('promo', ['overlay']));
    expect(result.ok ? [] : result.problems.map((item) => item.code)).toEqual(['overlay-retired']);
  }, 60_000);

  it('секция в шапке, теме и подвале — принимается как обычно', async () => {
    for (const group of ['header', 'page', 'footer']) {
      const result = await acceptSection({ db, store }, DOOR, folder(`in-${group}`, [group]));
      expect(result.status).toBe('accepted');
    }
  }, 60_000);

  it('секция, принятая с overlay раньше, — правка принимается, группа сохраняется', async () => {
    await saveDraft(db, legacy('promo'));
    expect(await hasOverlayWindow(db, doorFields(DOOR), 'shop:promo')).toBe(true);
    const edited = await acceptSection({ db, store }, DOOR, folder('promo', ['overlay'], 'Новая скидка'));
    expect(edited.status).toBe('accepted');
    expect(await hasOverlayWindow(db, doorFields(DOOR), 'shop:promo')).toBe(true);
  }, 60_000);

  it('прежнее окно другого магазина и другое имя не открывают дорогу новой секции', async () => {
    await saveDraft(db, legacy('promo', OTHER_SHOP));
    expect(await hasOverlayWindow(db, doorFields(DOOR), 'shop:promo')).toBe(false);
    await saveDraft(db, legacy('banner'));
    const result = await acceptSection({ db, store }, DOOR, folder('promo', ['overlay']));
    expect(result.status).toBe('refused');
  }, 60_000);
});
