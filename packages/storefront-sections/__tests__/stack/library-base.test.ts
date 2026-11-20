import { fileURLToPath } from 'node:url';
import { hashOf, sha256 } from '@merfy/storefront-build';
import { createS3Store } from '@merfy/storefront-storage';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { acceptSection } from '../../src/accept';
import { doorFields, type Door } from '../../src/doors';
import type { SectionFiles } from '../../src/format';
import type { LibraryHistory } from '../../src/library-history';
import { declineUpdate, updateOfferOf } from '../../src/library-update';
import { readSectionFolder } from '../../src/read-folder';
import { saveDraft, type NewSection } from '../../src/registry';
import { STACK, openPool, resetSections } from './db';

// Основа копии и предложение обновить на базе стенда (20.11): library_base пишет сохранение с явной основой, следующая
// правка наследует её, «без изменений» тоже может сменить основу; отказ мерчанта — таблица storefront_section_update_decline.
// Строки пишет реестр без сборки секции (она в CI на нагруженной машине упирается в build-timeout и к делу не относится).
const OUR_SECTIONS = fileURLToPath(new URL('../../../storefront-shell/sections', import.meta.url));
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const DOOR: Door = { author: 'shop', shopId: SHOP };
const NAME = 'shop:cart-badge';

// Файлы секции библиотеки — версия 1 истории этого теста.
const library: SectionFiles = await readSectionFolder(`${OUR_SECTIONS}/cart-badge`);
// Правка мерчанта: к шаблону секции библиотеки дописан комментарий — отпечаток не из истории.
const merchantEdit = (note: string): SectionFiles => ({
  ...library,
  'template.astro': `${library['template.astro'] ?? ''}\n<!-- ${note} -->\n`,
});
const V1 = hashOf(library);
const V2 = 'sha256:v2';
const HISTORY: LibraryHistory = {
  [V1]: { name: 'cart-badge', version: 1 },
  [V2]: { name: 'cart-badge', version: 2 },
};

// Строка реестра для файлов секции: манифест и исходник — из файлов, остальное — заглушки приёма.
function newSection(files: SectionFiles, libraryBase?: string): NewSection {
  return {
    door: doorFields(DOOR),
    section: {
      name: NAME,
      manifest: { sdk: 1, name: 'cart-badge', kind: 'section', title: 'Значок корзины', settings: [] },
      template: files['template.astro'] ?? '',
      render: null,
      script: null,
      warnings: [],
      scriptMeta: { uses: [], parts: [], classes: [] },
    },
    sourceHash: hashOf(files),
    contentHash: sha256(`content:${hashOf(files)}`),
    renderHash: null,
    scriptHash: null,
    source: files,
    tokenOrder: null,
    ...(libraryBase === undefined ? {} : { libraryBase }),
  };
}

let db: Pool;

beforeAll(() => {
  db = openPool();
});
afterAll(async () => {
  await db.end();
});
beforeEach(async () => {
  await resetSections(db);
  await db.query('TRUNCATE storefront_section_update_decline');
});

const baseOf = async (): Promise<string | null | undefined> => {
  const { rows } = await db.query<{ library_base: string | null }>(
    'SELECT library_base FROM storefront_section WHERE owner = $1 AND name = $2 AND draft',
    [SHOP, NAME],
  );
  return rows.at(0)?.library_base;
};
const rowCount = async (): Promise<number> =>
  (await db.query('SELECT 1 FROM storefront_section WHERE owner = $1 AND name = $2', [SHOP, NAME])).rows.length;

describe('основа копии в реестре', () => {
  it('сохранение с явной основой пишет library_base; без основы — null', async () => {
    expect((await saveDraft(db, newSection(library, V1))).row.libraryBase).toBe(V1);
    expect(await baseOf()).toBe(V1);
    await resetSections(db);
    expect((await saveDraft(db, newSection(library))).row.libraryBase ?? null).toBeNull();
  });

  it('правка без основы наследует основу прошлой текущей правки', async () => {
    await saveDraft(db, newSection(library, V1));
    const next = await saveDraft(db, newSection(merchantEdit('правка мерчанта')));
    expect([next.created, next.row.libraryBase]).toEqual([true, V1]);
    expect(await baseOf()).toBe(V1);
  });

  it('явная основа новой правки главнее унаследованной', async () => {
    await saveDraft(db, newSection(library, V1));
    await saveDraft(db, newSection(merchantEdit('правка'), V2));
    expect(await baseOf()).toBe(V2);
  });
});

describe('приём: «без изменений» с новой основой', () => {
  // Код тот же — сборки нет: приём узнаёт правку по отпечатку до неё.
  const accept = (files: SectionFiles, libraryBase?: string) =>
    acceptSection(
      { db, store: createS3Store(STACK.s3) },
      DOOR,
      files,
      libraryBase === undefined ? {} : { libraryBase },
    );

  it('основа меняется на той же строке, новой строки нет', async () => {
    const edit = merchantEdit('правка');
    await saveDraft(db, newSection(edit, V1));
    const same = await accept(edit, V2);
    expect([same.status, same.status === 'unchanged' ? same.row.libraryBase : undefined]).toEqual(['unchanged', V2]);
    expect(await baseOf()).toBe(V2);
    expect(await rowCount()).toBe(1);
  });

  it('без основы или с той же — строка не трогается', async () => {
    const edit = merchantEdit('правка');
    await saveDraft(db, newSection(edit, V1));
    await accept(edit);
    await accept(edit, V1);
    expect(await baseOf()).toBe(V1);
    expect(await rowCount()).toBe(1);
  });
});

describe('предложение по данным реестра', () => {
  it('изменённая копия с основой версии 1 — предложение до версии 2; перенос с основой версии 2 его снимает', async () => {
    await saveDraft(db, newSection(library, V1));
    expect(await updateOfferOf(db, SHOP, NAME, HISTORY)).toBeUndefined(); // копия не изменена: обновит выпуск секции
    await saveDraft(db, newSection(merchantEdit('правка мерчанта')));
    expect(await updateOfferOf(db, SHOP, NAME, HISTORY)).toMatchObject({
      base: { version: 1 },
      latest: { version: 2 },
    });
    await saveDraft(db, newSection(merchantEdit('перенесено'), V2));
    expect(await updateOfferOf(db, SHOP, NAME, HISTORY)).toBeUndefined();
  });

  it('отказ молчит до следующей версии библиотеки', async () => {
    await saveDraft(db, newSection(library, V1));
    await saveDraft(db, newSection(merchantEdit('правка мерчанта')));
    expect((await declineUpdate(db, SHOP, NAME, HISTORY))?.latest.version).toBe(2);
    expect(await updateOfferOf(db, SHOP, NAME, HISTORY)).toBeUndefined();
    const next: LibraryHistory = { ...HISTORY, 'sha256:v3': { name: 'cart-badge', version: 3 } };
    expect(await updateOfferOf(db, SHOP, NAME, next)).toMatchObject({ latest: { version: 3 } });
    expect(await declineUpdate(db, SHOP, NAME, HISTORY)).toBeUndefined(); // версии 2 уже отказано
  });
});
