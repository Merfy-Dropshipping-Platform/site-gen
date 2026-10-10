import { describe, expect, it } from 'vitest';
import { parseCoreParts } from '../build/core-parts';
import { shellEntry } from '../build/entry';
import coreParts from '../core-parts.json';

describe('состав ядра — один список', () => {
  it('часть из списка — статический импорт, вне списка — import(); порядок в списке не важен', () => {
    const entry = shellEntry(['cart']);
    expect(entry).toContain("import * as cartPart from './src/parts/cart.ts';");
    expect(entry).toContain('  cart: () => Promise.resolve(cartPart),');
    expect(entry).toContain("  auth: () => import('./src/parts/auth.ts'),");
    expect(entry).toContain("  favorites: () => import('./src/parts/favorites.ts'),");
    expect(entry).not.toContain('import * as authPart');
    expect(entry.endsWith('startBrowserShell();\n')).toBe(true);
    expect(shellEntry(['favorites', 'auth'])).toBe(shellEntry(['auth', 'favorites']));
  });

  it('core-parts.json пакета — все три части в ядре', () => {
    expect(parseCoreParts(coreParts)).toEqual(['auth', 'cart', 'favorites']);
  });

  it.each([
    ['не тот вид', [], 'core-parts.json: нужно { "core": ["auth", "cart", ...] }'],
    [
      'незнакомая часть',
      { core: ['cart', 'wishlist'] },
      'core-parts.json.core.1: нет такой части; есть auth, cart, favorites',
    ],
    ['повтор', { core: ['cart', 'cart'] }, 'core-parts.json: часть указана дважды'],
  ])('битый список (%s) — part-unknown', (_, value, message) => {
    expect(() => parseCoreParts(value)).toThrow(message);
  });
});
