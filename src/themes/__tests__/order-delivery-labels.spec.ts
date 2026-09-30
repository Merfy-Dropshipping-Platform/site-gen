import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deliveryMethodLabel,
  deliveryPeriodLabel,
  deliveryTrackingNumber,
  deliveryTrackingUrl,
  customerMayCancelShipment,
} from '../../../packages/theme-base/runtime/order-delivery';

/**
 * Личный кабинет → заказ: способ и срок доставки (владелец 26.09 — «custom» и «—»).
 *
 * Spec 117, шаг 5.2: заказ хранит доставку в общих полях (data-model.md §
 * orders) — `deliveryTariffName`/`deliveryCarrierName`/`deliveryMode` вместо
 * проверки по имени перевозчика в строке типа. Фикстуры ниже дополнены общими
 * полями там, где старая фикстура описывала состояние, которого после
 * миграции 2.1 (data-model.md) больше не бывает.
 */
describe('доставка заказа в личном кабинете', () => {
  it('название способа, выбранное на оформлении, а не код', () => {
    expect(deliveryMethodLabel({ deliveryType: 'custom', cdekTariffName: '24 часа' })).toBe('24 часа');
    expect(deliveryMethodLabel({ deliveryType: 'cdek', cdekTariffName: 'Посылка склад-дверь' })).toBe('Посылка склад-дверь');
    expect(deliveryMethodLabel({ deliveryType: 'pickup', cdekTariffName: 'Самовывоз из магазина' })).toBe('Самовывоз');
  });

  it('новое deliveryTariffName — впереди старого cdekTariffName (общие поля первыми)', () => {
    expect(
      deliveryMethodLabel({
        deliveryType: 'cdek_door',
        deliveryTariffName: 'Посылка склад-дверь',
        cdekTariffName: 'устаревшее имя',
      }),
    ).toBe('Посылка склад-дверь');
  });

  it('deliveryMode="self_pickup" — «Самовывоз» без проверки сырого deliveryType', () => {
    expect(deliveryMethodLabel({ deliveryType: 'custom', deliveryMode: 'self_pickup' })).toBe('Самовывоз');
  });

  it('название не задано, но известен перевозчик (deliveryCarrierName) — его имя, для любого перевозчика, не только СДЭК', () => {
    expect(deliveryMethodLabel({ deliveryType: 'cdek_door', deliveryCarrierName: 'СДЭК' })).toBe('СДЭК');
    expect(deliveryMethodLabel({ deliveryType: 'pek_door', deliveryCarrierName: 'ПЭК' })).toBe('ПЭК');
  });

  it('названия нет — понятная подпись, никогда не «custom» и не сырой код перевозчика', () => {
    expect(deliveryMethodLabel({ deliveryType: 'custom' })).toBe('Доставка');
    expect(deliveryMethodLabel({ deliveryType: 'own' })).toBe('Доставка');
    // ИЗМЕНИЛОСЬ (5.2): раньше typeLabel() сам узнавал «cdek» по подстроке типа и
    // показывал «СДЭК»; после миграции 2.1 (data-model.md) deliveryCarrierName
    // заполнен у ЛЮБОГО заказа СДЭК — сценарий «есть cdek_door, но нет вообще
    // никакого общего поля» реальным заказам не соответствует. Без единого общего
    // поля способ теперь — нейтральная подпись «Доставка», а не разбор строки типа.
    expect(deliveryMethodLabel({ deliveryType: 'cdek_door' })).toBe('Доставка');
    expect(deliveryMethodLabel({})).toBe('—');
  });

  it('трек-номер и ссылка отслеживания — общие поля, старый номер СДЭК запасной', () => {
    expect(deliveryTrackingNumber({ trackingNumber: '1234567890' })).toBe('1234567890');
    expect(deliveryTrackingNumber({ cdekNumber: '0987654321' })).toBe('0987654321');
    expect(deliveryTrackingNumber({ trackingNumber: '111', cdekNumber: '222' })).toBe('111');
    expect(deliveryTrackingNumber({})).toBe('');
    expect(deliveryTrackingUrl({ trackingUrl: 'https://www.cdek.ru/ru/tracking?order_id=0987654321' })).toBe(
      'https://www.cdek.ru/ru/tracking?order_id=0987654321',
    );
    expect(deliveryTrackingUrl({})).toBe('');
  });

  it('отмена покупателем — по shipmentCancellable перевозчика, а без него — по статусу отправления (решение владельца 29.09)', () => {
    expect(customerMayCancelShipment({ shipmentCancellable: true, deliveryStatus: 'IN_TRANSIT' })).toBe(true);
    expect(customerMayCancelShipment({ shipmentCancellable: false, deliveryStatus: null })).toBe(false);
    expect(customerMayCancelShipment({ deliveryStatus: 'CREATED' })).toBe(true);
    expect(customerMayCancelShipment({ deliveryStatus: 'REGISTERING' })).toBe(true);
    expect(customerMayCancelShipment({ deliveryStatus: 'REGISTRATION_FAILED' })).toBe(true);
    expect(customerMayCancelShipment({ deliveryStatus: 'IN_TRANSIT' })).toBe(false);
    expect(customerMayCancelShipment({ deliveryStatus: 'DELIVERED' })).toBe(false);
    expect(customerMayCancelShipment({})).toBe(true);
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
