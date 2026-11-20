import { fileURLToPath } from 'node:url';
import { createS3Store } from '@merfy/storefront-storage';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { acceptSection } from '../../src/accept';
import type { Door } from '../../src/doors';
import type { SectionFiles } from '../../src/format';
import { libraryHashesOf, libraryLatestOf } from '../../src/library-history';
import { readSectionFolder } from '../../src/read-folder';
import { STACK, openPool, resetSections } from './db';

// Основа первой правки новой секции магазина без явного basedOn (20.11) — приём целиком, с настоящей сборкой секции и
// настоящими generated/library-index.json и library-history.json: копия неизменённой библиотечной секции под новым именем
// помнит версию библиотеки, изменённая — нет, явная основа главнее, следующие правки основу наследуют.
const OUR_SECTIONS = fileURLToPath(new URL('../../../storefront-shell/sections', import.meta.url));
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const DOOR: Door = { author: 'shop', shopId: SHOP };
const COPY = 'shop:badge-copy';

const library: SectionFiles = await readSectionFolder(`${OUR_SECTIONS}/cart-badge`);
const latest = libraryLatestOf('cart-badge');
const older = [...libraryHashesOf('cart-badge')].find((hash) => hash !== latest?.hash);

// Копия под другим именем и названием: файлы те же.
const renamed = (name: string, title: string): SectionFiles => ({
  ...library,
  'section.json': JSON.stringify({ ...JSON.parse(library['section.json'] ?? '{}'), name, title }),
});
const copy = renamed('badge-copy', 'Значок корзины (копия)');
// Правка мерчанта: к шаблону дописан комментарий.
const merchantEdit = (files: SectionFiles, note: string): SectionFiles => ({
  ...files,
  'template.astro': `${files['template.astro'] ?? ''}\n<!-- ${note} -->\n`,
});

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

const accept = (files: SectionFiles, libraryBase?: string) =>
  acceptSection({ db, store: createS3Store(STACK.s3) }, DOOR, files, libraryBase === undefined ? {} : { libraryBase });

const baseOf = async (): Promise<string | null | undefined> => {
  const { rows } = await db.query<{ library_base: string | null }>(
    'SELECT library_base FROM storefront_section WHERE owner = $1 AND name = $2 AND draft',
    [SHOP, COPY],
  );
  return rows.at(0)?.library_base;
};

describe('основа первой правки новой секции без basedOn', () => {
  it('в истории есть cart-badge и более старая версия (условия теста)', () => {
    expect([latest?.name, older === undefined]).toEqual(['cart-badge', false]);
  });

  it('копия неизменённой библиотечной секции под новым именем получает основу — точный отпечаток текущей версии', async () => {
    const result = await accept(copy);
    expect(result.status).toBe('accepted');
    expect(await baseOf()).toBe(latest?.hash);
  });

  it('изменённая копия основы не получает', async () => {
    const result = await accept(merchantEdit(copy, 'свой текст'));
    expect(result.status).toBe('accepted');
    expect(await baseOf()).toBeNull();
  });

  it('явный basedOn главнее найденной основы', async () => {
    await accept(copy, older);
    expect(await baseOf()).toBe(older);
  });

  it('вторая и следующие правки основу наследуют; основу первой правки не пересчитывают по новым файлам', async () => {
    await accept(copy);
    await accept(merchantEdit(copy, 'правка 1'));
    expect(await baseOf()).toBe(latest?.hash);
    await accept(merchantEdit(copy, 'правка 2'));
    expect(await baseOf()).toBe(latest?.hash);
  });

  it('основу ищут только при первом сохранении: после изменённой первой правки возврат к библиотечным файлам её не даёт', async () => {
    await accept(merchantEdit(copy, 'правка 1'));
    expect(await baseOf()).toBeNull();
    await accept(copy);
    expect(await baseOf()).toBeNull();
  });
});
