import { describe, expect, it } from 'vitest';
import { templateOptionsOf } from '../src/compile';
import { MANIFEST_FILE, propsUsesOf, readManifest } from '../src/format';
import type { Checked, SectionProblem } from '../src/problems';

// "uses" с модулями SDK (блок 5 «Секций и SDK», раздел 3.8; часть 5в): cart, favorites, auth, newsletter — модули ctx
// скрипта; theme и shop — данные шаблона, только они идут в шаблон и во входы сборки.
const read = (fields: Record<string, unknown>) =>
  readManifest({
    [MANIFEST_FILE]: JSON.stringify({ sdk: 1, name: 'scarf', kind: 'section', title: 'Шарф', ...fields }),
  });
const messages = (result: Checked<unknown>): string[] =>
  result.ok ? [] : result.problems.map((item: SectionProblem) => `${item.code} ${item.message}`);

describe('uses с модулями SDK', () => {
  it('модули SDK и theme, shop — в любом порядке; в шаблон — только theme и shop', () => {
    const manifest = read({ uses: ['cart', 'theme', 'newsletter', 'shop', 'favorites', 'auth'] });
    expect(messages(manifest)).toEqual([]);
    expect(manifest.ok && propsUsesOf(manifest.value)).toEqual(['theme', 'shop']);
    expect(manifest.ok && templateOptionsOf(manifest.value).uses).toEqual(['theme', 'shop']);
    const plain = read({});
    expect(plain.ok && propsUsesOf(plain.value)).toEqual([]);
  });

  it('незнакомый модуль и повтор — manifest-invalid', () => {
    expect(messages(read({ uses: ['basket'] })).map((line) => line.split(' ')[0])).toEqual(['manifest-invalid']);
    expect(messages(read({ uses: ['cart', 'cart'] })).map((line) => line.split(' ')[0])).toEqual(['manifest-invalid']);
  });

  it('глобальный скрипт: модули SDK — можно, theme и shop — нет: шаблона у него нет', () => {
    const global = (uses: string[]) => read({ kind: 'global', uses });
    expect(messages(global(['cart', 'favorites']))).toEqual([]);
    expect(messages(global(['cart', 'shop']))).toEqual([
      'manifest-invalid uses: shop — данные шаблона, у глобального скрипта шаблона нет',
    ]);
    expect(messages(read({ kind: 'global', limit: 1 }))).toEqual([
      'manifest-invalid limit: у глобального скрипта нет места на странице',
    ]);
  });
});
