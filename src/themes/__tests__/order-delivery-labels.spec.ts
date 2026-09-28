import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deliveryMethodLabel, deliveryPeriodLabel } from '../../../packages/theme-base/runtime/order-delivery';

/**
 * Личный кабинет → заказ: способ и срок доставки (владелец 26.09 — «custom» и «—»).
 */
describe('доставка заказа в личном кабинете', () => {
  it('название способа, выбранное на оформлении, а не код', () => {
    expect(deliveryMethodLabel({ deliveryType: 'custom', cdekTariffName: '24 часа' })).toBe('24 часа');
    expect(deliveryMethodLabel({ deliveryType: 'cdek', cdekTariffName: 'Посылка склад-дверь' })).toBe('Посылка склад-дверь');
    expect(deliveryMethodLabel({ deliveryType: 'pickup', cdekTariffName: 'Самовывоз из магазина' })).toBe('Самовывоз');
  });

  it('названия нет — понятная подпись, никогда не «custom»', () => {
    expect(deliveryMethodLabel({ deliveryType: 'custom' })).toBe('Доставка');
    expect(deliveryMethodLabel({ deliveryType: 'own' })).toBe('Доставка');
    expect(deliveryMethodLabel({ deliveryType: 'cdek_door' })).toBe('СДЭК');
    expect(deliveryMethodLabel({})).toBe('—');
  });

  it('срок доставки словами; нет срока — пусто', () => {
    expect(deliveryPeriodLabel({ deliveryPeriodMin: 1, deliveryPeriodMax: 3 })).toBe('1–3 дня');
    expect(deliveryPeriodLabel({ deliveryPeriodMin: 2, deliveryPeriodMax: 2 })).toBe('2 дня');
    expect(deliveryPeriodLabel({ deliveryPeriodMax: 5 })).toBe('5 дней');
    expect(deliveryPeriodLabel({ deliveryPeriodMin: 1, deliveryPeriodMax: 21 })).toBe('1–21 день');
    expect(deliveryPeriodLabel({ deliveryPeriodMin: 11, deliveryPeriodMax: 14 })).toBe('11–14 дней');
    expect(deliveryPeriodLabel({})).toBe('');
    expect(deliveryPeriodLabel({ deliveryPeriodMin: 0, deliveryPeriodMax: 0 })).toBe('');
  });

  it.each(['rose', 'vanilla', 'bloom', 'satin', 'flux'])('%s: страница заказа берёт подписи из общего помощника', (theme) => {
    const src = readFileSync(resolve(__dirname, '../../../themes', theme, 'src/pages/account/order.astro'), 'utf-8');
    expect(src).toContain('runtime/order-delivery');
    expect(src).not.toMatch(/deliveryMethod = order\.deliveryType/);
  });
});
