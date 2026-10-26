import { fileURLToPath } from 'node:url';
import { sha256 } from '@merfy/storefront-build';
import { createS3Store } from '@merfy/storefront-storage';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { acceptSection } from '../../src/accept';
import { doorFields, type Door } from '../../src/doors';
import { readSectionFolder } from '../../src/read-folder';
import {
  DraftChangedError,
  currentDraft,
  publishDrafts,
  publishSection,
  saveDraft,
  visibleSections,
  type NewSection,
} from '../../src/registry';
import { STACK, openPool, resetSections } from './db';

// Новая версия нашей секции во всех магазинах (блок 15, часть 15з): сохранение с условием «текущая правка всё ещё та»
// (Р15з-2) и публикация одной секции магазина без его других текущих правок (Р15з-5).
let db: Pool;
beforeAll(() => {
  db = openPool();
});
afterAll(async () => {
  await db.end();
});
beforeEach(async () => {
  await resetSections(db);
});

const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const OUR_SECTIONS = fileURLToPath(new URL('../../../storefront-shell/sections', import.meta.url));
const door: Door = { author: 'shop', shopId: SHOP };
const visibility = { shopId: SHOP, extensions: [] };

function edit(name: string, text: string): NewSection {
  const template = `<p>${text}</p>`;
  return {
    door: doorFields(door),
    section: {
      name: `shop:${name}`,
      manifest: { sdk: 1, name, kind: 'section', title: name, settings: [] },
      template,
      render: null,
      script: null,
      warnings: [],
      scriptMeta: { uses: [], parts: [], classes: [] },
    },
    sourceHash: sha256(`source:${text}`),
    contentHash: sha256(`content:${text}`),
    renderHash: null,
    scriptHash: null,
    tokenOrder: null,
    source: { 'section.json': `{"name":"${name}"}`, 'template.astro': template },
  };
}

describe('правка своей секции с условием (Р15з-2)', () => {
  it('условие совпало — новая текущая правка; не совпало или null при секции — DraftChangedError', async () => {
    const v1 = edit('reviews', 'v1');
    await saveDraft(db, v1);
    const v2 = await saveDraft(db, edit('reviews', 'v2'), v1.sourceHash);
    expect(v2.created).toBe(true);
    await expect(saveDraft(db, edit('reviews', 'merchant'), v1.sourceHash)).rejects.toBeInstanceOf(DraftChangedError);
    await expect(saveDraft(db, edit('reviews', 'merchant'), null)).rejects.toBeInstanceOf(DraftChangedError);
    expect((await currentDraft(db, SHOP, 'shop:reviews'))?.sourceHash).toBe(v2.row.sourceHash);
  });

  it('тот же исходник при любом условии — без изменений, без ошибки', async () => {
    await saveDraft(db, edit('reviews', 'v1'));
    expect((await saveDraft(db, edit('reviews', 'v1'), sha256('другой'))).created).toBe(false);
  });

  it('acceptSection передаёт условие: правка мерчанта между проверкой и сохранением не затирается', async () => {
    const store = createS3Store(STACK.s3);
    const ours = await readSectionFolder(`${OUR_SECTIONS}/cart-badge`);
    const first = await acceptSection({ db, store }, door, ours);
    if (first.status === 'refused') throw new Error('наша секция не прошла проверку');
    const withText = (text: string) => ({ ...ours, 'template.astro': (ours['template.astro'] ?? '').replace('Корзина', text) });
    await acceptSection({ db, store }, door, withText('Корзинка'));
    await expect(
      acceptSection({ db, store }, door, withText('Корзина · 15з'), { expectDraft: first.row.sourceHash }),
    ).rejects.toBeInstanceOf(DraftChangedError);
  });
});

describe('публикация одной своей секции (Р15з-5)', () => {
  it('на витрину — только эта секция; другие текущие правки магазина остаются черновиками', async () => {
    await saveDraft(db, edit('reviews', 'v1'));
    await saveDraft(db, edit('faq', 'f1'));
    await publishDrafts(db, SHOP);
    const v2 = edit('reviews', 'v2');
    await saveDraft(db, v2);
    await saveDraft(db, edit('faq', 'f2'));
    expect(await publishSection(db, SHOP, 'shop:reviews', v2.sourceHash)).toBe('published');
    const live = await visibleSections(db, visibility);
    expect(live.map((row) => [row.name, row.template])).toEqual([
      ['shop:faq', '<p>f1</p>'],
      ['shop:reviews', '<p>v2</p>'],
    ]);
  });

  it('повтор и правка мерчанта поверх уже вынесенной — already; другой исходник или секции нет — changed', async () => {
    expect(await publishSection(db, SHOP, 'shop:reviews', sha256('source:v1'))).toBe('changed');
    await saveDraft(db, edit('reviews', 'v1'));
    await publishDrafts(db, SHOP);
    const v2 = edit('reviews', 'v2');
    await saveDraft(db, v2);
    expect(await publishSection(db, SHOP, 'shop:reviews', v2.sourceHash)).toBe('published');
    expect(await publishSection(db, SHOP, 'shop:reviews', v2.sourceHash)).toBe('already');
    await saveDraft(db, edit('reviews', 'merchant'));
    expect(await publishSection(db, SHOP, 'shop:reviews', v2.sourceHash)).toBe('already');
    expect(await publishSection(db, SHOP, 'shop:reviews', sha256('source:v3'))).toBe('changed');
    const [live] = await visibleSections(db, visibility);
    expect(live?.template).toBe('<p>v2</p>');
  });
});
