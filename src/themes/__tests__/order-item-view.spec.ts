import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { orderItemView } from '../../../packages/theme-base/runtime/order-item';

/**
 * Личный кабинет → заказ: название и цена позиции (владелец 27.09 — «Товар» и «—»).
 * Поля позиции заказа — orders `order_items`: name, unitPriceCents, discountCents, totalCents.
 */
describe('позиция заказа в личном кабинете', () => {
  it('название и цена из полей позиции заказа', () => {
    expect(orderItemView({ name: 'Футболка', quantity: 1, unitPriceCents: 250000, totalCents: 250000, discountCents: 0 }))
      .toEqual({ name: 'Футболка', quantity: 1, priceCents: 250000, oldPriceCents: null, quantityLabel: '1 шт.' });
  });

  it('скидка на строку: цена за штуку со скидкой, обычная — зачёркнутая', () => {
    expect(orderItemView({ name: 'Футболка', quantity: 2, unitPriceCents: 250000, totalCents: 500000, discountCents: 100000 }))
      .toEqual({ name: 'Футболка', quantity: 2, priceCents: 200000, oldPriceCents: 250000, quantityLabel: '2 шт.' });
  });

  it('старые поля (productName / priceCents / comparePriceCents) по-прежнему понимаются', () => {
    expect(orderItemView({ productName: 'Сумка', quantity: 1, priceCents: 549000, comparePriceCents: 899000 }))
      .toEqual({ name: 'Сумка', quantity: 1, priceCents: 549000, oldPriceCents: 899000, quantityLabel: '1 шт.' });
  });

  it('цены нет вовсе — null (страница покажет «—»), название — «Товар»', () => {
    expect(orderItemView({})).toEqual({ name: 'Товар', quantity: 1, priceCents: null, oldPriceCents: null, quantityLabel: '1 шт.' });
  });

  it.each(['rose', 'vanilla', 'bloom', 'satin', 'flux'])('%s: страница заказа берёт позицию из общего помощника', (theme) => {
    const src = readFileSync(resolve(__dirname, '../../../themes', theme, 'src/pages/account/order.astro'), 'utf-8');
    expect(src).toContain('runtime/order-item');
    expect(src).not.toMatch(/item\.productName|item\.priceCents/);
  });
});
