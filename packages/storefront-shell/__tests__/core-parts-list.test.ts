import { describe, expect, it } from 'vitest';
import { parseCoreParts } from '../build/core-parts';
import coreParts from '../core-parts.json';

// Состав ядра секций — один список core-parts.json (С7-3 Б; блок 5 «Секций и SDK», часть 5б): части из него — в бандле
// каждой страницы магазина, их получает каждая секция до части 5в.
describe('состав ядра — один список', () => {
  it('core-parts.json пакета — четыре части в ядре, auth — нет (блок 15, часть 15ж)', () => {
    expect(parseCoreParts(coreParts)).toEqual(['cart', 'consent', 'customer', 'favorites']);
  });

  it.each([
    ['не тот вид', [], 'core-parts.json: нужно { "core": ["auth", "cart", ...] }'],
    [
      'незнакомая часть',
      { core: ['cart', 'wishlist'] },
      'core-parts.json.core.1: нет такой части; есть auth, cart, consent, customer, favorites',
    ],
    ['повтор', { core: ['cart', 'cart'] }, 'core-parts.json: часть указана дважды'],
  ])('битый список (%s) — part-unknown', (_, value, message) => {
    expect(() => parseCoreParts(value)).toThrow(message);
  });
});
