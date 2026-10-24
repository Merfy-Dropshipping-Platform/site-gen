import { sha256 } from '@merfy/storefront-build';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { doorFields, type Door } from '../../src/doors';
import {
  draftSource,
  editableSections,
  publishDrafts,
  saveDraft,
  visibleSections,
  type NewSection,
} from '../../src/registry';
import { openPool, resetSections } from './db';

// Черновики своих секций для конструктора и файлы текущей правки (блок 14 «Секций и SDK», Р14-14).
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
const OTHER = '0b6f3c2e-8a41-4d5f-9c7e-1a2b3c4d5e6f';
const door = (shopId: string): Door => ({ author: 'shop', shopId });

function edit(shopId: string, name: string, text: string): NewSection {
  const template = `<p>${text}</p>`;
  return {
    door: doorFields(door(shopId)),
    section: {
      name: `shop:${name}`,
      manifest: { sdk: 1, name, kind: 'section', title: name, settings: [] },
      template,
      render: null,
      script: null,
      warnings: [],
    },
    sourceHash: sha256(`source:${text}`),
    contentHash: sha256(`content:${text}`),
    renderHash: null,
    scriptHash: null,
    tokenOrder: null,
    source: { 'section.json': `{"name":"${name}"}`, 'template.astro': template },
  };
}

const visibility = (shopId: string) => ({ shopId, extensions: [] });

describe('черновики своих секций', () => {
  it('конструктор видит текущую правку до публикации; сборка — только опубликованную', async () => {
    await saveDraft(db, edit(SHOP, 'reviews', 'v1'));
    expect((await editableSections(db, visibility(SHOP))).map((row) => row.name)).toEqual(['shop:reviews']);
    expect(await visibleSections(db, visibility(SHOP))).toEqual([]);
    await publishDrafts(db, SHOP);
    await saveDraft(db, edit(SHOP, 'reviews', 'v2'));
    const [editable] = await editableSections(db, visibility(SHOP));
    const [visible] = await visibleSections(db, visibility(SHOP));
    expect([editable?.template, visible?.template]).toEqual(['<p>v2</p>', '<p>v1</p>']);
  });

  it('черновики другого магазина не видны', async () => {
    await saveDraft(db, edit(OTHER, 'reviews', 'v1'));
    expect(await editableSections(db, visibility(SHOP))).toEqual([]);
  });

  it('файлы текущей правки — своего магазина; нет секции — null', async () => {
    const first = await saveDraft(db, edit(SHOP, 'reviews', 'v1'));
    const second = await saveDraft(db, edit(SHOP, 'reviews', 'v2'));
    expect(await draftSource(db, SHOP, 'shop:reviews')).toEqual({
      id: second.row.id,
      files: { 'section.json': '{"name":"reviews"}', 'template.astro': '<p>v2</p>' },
    });
    expect(first.row.id).not.toBe(second.row.id);
    expect(await draftSource(db, OTHER, 'shop:reviews')).toBeNull();
    expect(await draftSource(db, SHOP, 'shop:faq')).toBeNull();
  });
});
