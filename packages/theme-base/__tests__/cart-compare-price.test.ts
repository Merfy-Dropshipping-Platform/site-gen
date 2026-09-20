import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Баг тестера (18.09): «В секции Корзина во всех темах не отображается цена до
 * скидки. Rose, Bloom, Satin».
 *
 * Данные до строки корзины доходят: `ntLinesToStoreItems` кладёт
 * `compareAtPriceCents` из `line.oldPrice`. А рендер строки выводил только
 * текущую цену — старая никуда не попадала, и покупатель не видел выгоду.
 * В боковой корзине тем зачёркнутая цена рисуется, на странице корзины — нет.
 */
const CART_BODY = join(__dirname, '..', 'blocks', 'CartBody', 'CartBody.astro');

describe('строка корзины показывает цену до скидки', () => {
  const src = readFileSync(CART_BODY, 'utf8');

  it('старая цена берётся из данных позиции', () => {
    expect(src).toMatch(/var oldPrice = item\.compareAtPriceCents/);
  });

  it('рисуется зачёркнутой и только когда она выше текущей', () => {
    const i = src.indexOf('oldPrice && oldPrice > price');
    expect(i).toBeGreaterThan(-1);
    const fragment = src.slice(i, i + 400);
    expect(fragment).toContain('line-through');
    expect(fragment).toContain('fmt(oldPrice)');
  });

  it('данные позиции по-прежнему несут compareAtPriceCents', () => {
    expect(src).toMatch(/compareAtPriceCents:\s*l\.oldPrice/);
  });
});
