import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isLibrarySection } from '../src/library-history';
import { readSectionFolder } from '../src/read-folder';
import { libraryUnchanged, libraryUnchangedIn, type RowsQuery } from '../src/registry';

// Секция платформы для проверок черновика (19.11): библиотечная, которую в магазине не меняли. Роль секции признаком не
// служит: своя корзина агента — его секция.
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const SHELL_DIR = fileURLToPath(new URL('../../storefront-shell/sections/', import.meta.url));

const withTemplate = (files: Record<string, string>, extra: string): Record<string, string> => ({
  ...files,
  'template.astro': `${files['template.astro'] ?? ''}\n${extra}`,
});

// Реестр в одну функцию: отдаёт строки правок своих секций по запрошенным именам.
function registry(sources: Record<string, Record<string, string>>): RowsQuery & { asked: unknown[][] } {
  const asked: unknown[][] = [];
  return {
    asked,
    query: (_sql, values) => {
      asked.push(values);
      const names: unknown = values[1];
      const rows = Object.entries(sources)
        .filter(([name]) => Array.isArray(names) && names.includes(name))
        .map(([name, source]) => ({ name, source }));
      return Promise.resolve({ rows });
    },
  };
}

describe('секция осталась библиотечной', () => {
  it('не тронутая — да; под другим именем, изменённая и чужая — нет (отпечаток точный)', async () => {
    const hero = await readSectionFolder(`${PACKAGE_DIR}fixtures/shop/hero`);
    const renamed = {
      ...hero,
      'section.json': (hero['section.json'] ?? '').replace('"name": "hero"', '"name": "top"'),
    };
    expect(isLibrarySection(hero)).toBe(true);
    expect(isLibrarySection(renamed)).toBe(false);
    expect(isLibrarySection(withTemplate(hero, '<!-- правка -->'))).toBe(false);
    expect(isLibrarySection({ 'template.astro': 'x' })).toBe(false);
    expect(isLibrarySection({ 'section.json': '{' })).toBe(false);
  });
});

describe('какие секции магазина платформенные', () => {
  it('неизменённая библиотечная — да; изменённая библиотечная и своя с ролью — нет', async () => {
    const hero = await readSectionFolder(`${PACKAGE_DIR}fixtures/shop/hero`);
    const cart = await readSectionFolder(`${SHELL_DIR}cart`);
    const db = registry({
      'shop:hero': hero,
      'shop:cart': cart,
      'shop:hero-edited': withTemplate(hero, '<!-- правка -->'),
      // Своя корзина агента: роль та же, код другой.
      'shop:my-cart': withTemplate(cart, '<!-- своя -->'),
    });
    const names = ['shop:hero', 'shop:cart', 'shop:hero-edited', 'shop:my-cart', 'shop:absent'];
    const platform = await libraryUnchanged(db, 'shop-1', names);
    expect([...platform].sort()).toEqual(['shop:cart', 'shop:hero']);
    expect(db.asked).toEqual([['shop-1', names]]);
  });

  it('секций на странице нет — в базу не ходим', async () => {
    const db = registry({});
    expect((await libraryUnchanged(db, 'shop-1', [])).size).toBe(0);
    expect(db.asked).toEqual([]);
  });
});

// Аудит после публикации (20.11): секции платформы — по исходникам именно этой сборки (пара «имя, отпечаток правки»), а
// не по текущему черновику.
describe('какие секции сборки платформенные', () => {
  it('спрашивает базу парами имя-отпечаток и берёт только библиотечные; пусто — в базу не ходит', async () => {
    const hero = await readSectionFolder(`${PACKAGE_DIR}fixtures/shop/hero`);
    const asked: unknown[][] = [];
    const db: RowsQuery = {
      query: (_sql, values) => {
        asked.push(values);
        return Promise.resolve({
          rows: [
            { name: 'shop:hero', source: hero },
            { name: 'shop:hero-edited', source: withTemplate(hero, '<!-- правка -->') },
          ],
        });
      },
    };
    const sections = [
      { name: 'shop:hero', hash: 'sha256:aa' },
      { name: 'shop:hero-edited', hash: 'sha256:bb' },
    ];
    expect([...(await libraryUnchangedIn(db, 'shop-1', sections))]).toEqual(['shop:hero']);
    expect(asked).toEqual([['shop-1', ['shop:hero', 'shop:hero-edited'], ['sha256:aa', 'sha256:bb']]]);
    expect((await libraryUnchangedIn(db, 'shop-1', [])).size).toBe(0);
    expect(asked).toHaveLength(1);
  });
});
