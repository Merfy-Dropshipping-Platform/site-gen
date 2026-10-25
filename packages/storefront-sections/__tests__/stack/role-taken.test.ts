import { fileURLToPath } from 'node:url';
import { sha256 } from '@merfy/storefront-build';
import { createS3Store, type ObjectStore } from '@merfy/storefront-storage';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { acceptSection } from '../../src/accept';
import { doorFields, type Door } from '../../src/doors';
import { readSectionFolder } from '../../src/read-folder';
import { RoleTakenError, currentDraft, publishDrafts, saveDraft, type NewSection } from '../../src/registry';
import type { SectionRole } from '../../src/roles';
import { STACK, openPool, resetSections } from './db';

// Одна секция на роль в магазине (блок 12 «Секций и SDK», 12.1, «Решил сам» п. 4; часть 12а): вторая секция с той же
// ролью — отказ с именем той, что роль занимает; новая версия той же секции — можно; черновик тоже занимает роль.
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const OTHER_SHOP = '0b6f3c2e-8a41-4d5f-9c7e-1a2b3c4d5e6f';
const ROLES = fileURLToPath(new URL('../../fixtures/roles', import.meta.url));
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

// Правка своей секции, как её отдаёт приём: исходник — строка текста, отпечатки — от неё.
function edit(name: string, source: string, role?: SectionRole, shopId = SHOP): NewSection {
  const door: Door = { author: 'shop', shopId };
  const template = `<p>${source}</p>`;
  return {
    door: doorFields(door),
    section: {
      name: `shop:${name}`,
      manifest: { sdk: 1, name, kind: 'section', title: name, settings: [], ...(role === undefined ? {} : { role }) },
      template,
      render: null,
      script: null,
      warnings: [],
      scriptMeta: { uses: [], parts: [], classes: [] },
    },
    sourceHash: sha256(`source:${name}:${source}`),
    contentHash: sha256(`content:${name}:${source}`),
    renderHash: null,
    scriptHash: null,
    // Отклонение от плана (правило 24.10): NewSection в dev требует tokenOrder — в тексте карточки его нет.
    tokenOrder: null,
    source: { 'template.astro': template },
  };
}

describe('одна секция на роль', () => {
  it('вторая секция с той же ролью — RoleTakenError с ролью и именем той, что роль занимает; строки нет', async () => {
    await saveDraft(db, edit('cart-drawer', 'v1', 'cart-drawer'));
    const second = saveDraft(db, edit('my-cart-drawer', 'v1', 'cart-drawer'));
    await expect(second).rejects.toBeInstanceOf(RoleTakenError);
    await expect(second).rejects.toMatchObject({ role: 'cart-drawer', holder: 'shop:cart-drawer' });
    expect(await currentDraft(db, SHOP, 'shop:my-cart-drawer')).toBeNull();
  });

  it('новая версия той же секции — можно; секции без роли и с другой ролью — можно', async () => {
    await saveDraft(db, edit('cart-drawer', 'v1', 'cart-drawer'));
    const next = await saveDraft(db, edit('cart-drawer', 'v2', 'cart-drawer'));
    expect(next.created).toBe(true);
    await saveDraft(db, edit('hero', 'v1'));
    await saveDraft(db, edit('cart-added', 'v1', 'cart-added'));
    expect((await currentDraft(db, SHOP, 'shop:cart-added'))?.manifest).toMatchObject({ role: 'cart-added' });
  });

  it('черновик занимает роль и до публикации, и после; у другого магазина — свои роли', async () => {
    await saveDraft(db, edit('cart-drawer', 'v1', 'cart-drawer'));
    await expect(saveDraft(db, edit('my-cart-drawer', 'v1', 'cart-drawer'))).rejects.toBeInstanceOf(RoleTakenError);
    await publishDrafts(db, SHOP);
    await expect(saveDraft(db, edit('my-cart-drawer', 'v2', 'cart-drawer'))).rejects.toBeInstanceOf(RoleTakenError);
    const other = await saveDraft(db, edit('my-cart-drawer', 'v1', 'cart-drawer', OTHER_SHOP));
    expect(other.created).toBe(true);
  });

  it('секция сняла роль новой версией — роль свободна', async () => {
    await saveDraft(db, edit('cart-drawer', 'v1', 'cart-drawer'));
    await saveDraft(db, edit('cart-drawer', 'v2'));
    const freed = await saveDraft(db, edit('my-cart-drawer', 'v1', 'cart-drawer'));
    expect(freed.created).toBe(true);
  });

  it('приём: вторая секция с ролью — отказ role-taken с именем; та же секция заново — без изменений', async () => {
    const door: Door = { author: 'shop', shopId: SHOP };
    const deps = { db, store };
    const drawer = await readSectionFolder(`${ROLES}/cart-drawer`);
    expect((await acceptSection(deps, door, drawer)).status).toBe('accepted');
    const refused = await acceptSection(deps, door, await readSectionFolder(`${ROLES}/my-cart-drawer`));
    expect(refused).toEqual({
      status: 'refused',
      problems: [
        {
          code: 'role-taken',
          file: 'section.json',
          line: null,
          column: null,
          message: 'в магазине уже есть секция с ролью cart-drawer — shop:cart-drawer, измени её',
        },
      ],
    });
    expect((await acceptSection(deps, door, drawer)).status).toBe('unchanged');
  }, 60_000);
});
