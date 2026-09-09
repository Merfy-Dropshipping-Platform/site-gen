/**
 * @jest-environment jsdom
 *
 * CheckoutDeliveryMethod — «Вариант A»: понятные, дедуплицированные варианты СДЭК.
 *  - постамат-тариф (pickupPointKind 'POSTAMAT') рисуется как «Постамат…»,
 *    а НЕ как «…пункт выдачи» (фикс мислейбла);
 *  - дубли ПВЗ-тарифов (склад-склад 255₽ + дверь-склад 510₽, одна точка
 *    назначения) схлопываются в ОДНУ карточку по самой низкой цене (255, тариф 136);
 *  - курьер (deliveryMode 'door') рисуется с door-лейблом;
 *  - OWN-тариф и самовывоз магазина остаются нетронутыми;
 *  - бейдж «дешевле всего» вешается на единственную самую дешёвую платную карточку.
 * Скрипт извлекается из .astro и исполняется в jsdom (как pvz-picker тест).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ASTRO = join(
  __dirname,
  '..',
  'blocks',
  'CheckoutDeliveryMethod',
  'CheckoutDeliveryMethod.astro',
);

function inlineScriptBody(src: string): string {
  const m = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(src);
  if (!m) throw new Error('no <script> in CheckoutDeliveryMethod.astro');
  return m[1];
}

const SCRIPT = inlineScriptBody(readFileSync(ASTRO, 'utf8'));

function mountDom(pickupEnabled: boolean): HTMLElement {
  document.body.innerHTML = `
    <section data-checkout-delivery-method data-puck-component-id="cdm-1"
             data-cdek-enabled="true"
             data-cdek-door-label="Курьер СДЭК до двери"
             data-cdek-pvz-label="Пункт выдачи СДЭК"
             data-cdek-postamat-label="Постамат СДЭК"
             data-pickup-enabled="${pickupEnabled ? 'true' : 'false'}"
             data-pickup-label="Самовывоз"
             data-free-shipping-threshold="">
      <div data-checkout-delivery-empty></div>
      <div data-checkout-delivery-loading hidden></div>
      <div data-checkout-delivery-error hidden></div>
      <div data-checkout-delivery-list hidden></div>
      <div data-cdek-pvz-picker hidden></div>
    </section>`;
  return document.querySelector('[data-checkout-delivery-method]') as HTMLElement;
}

function runScript(section: HTMLElement) {
  (window as any).__merfyRoot = () => section;
  // eslint-disable-next-line no-new-func
  new Function('blockId', SCRIPT)('cdm-1');
}

async function flush(ms = 30) {
  await new Promise((r) => setTimeout(r, ms));
}

// Дубли ПВЗ (136 склад-склад 255 + 138 дверь-склад 510) + постамат + курьер + OWN.
function calcData(deliveryOptions: any[], pickupPoints: any[] = []) {
  return { success: true, data: { deliveryOptions, pickupPoints } };
}

const DEDUP_OPTIONS = [
  { id: 'o136', name: 'Посылка склад-склад', type: 'PARTNER', price: 255, minDays: 2, maxDays: 4, description: '', cdekTariffCode: 136, deliveryMode: 'pickup', pickupPointKind: 'PVZ' },
  { id: 'o138', name: 'Посылка дверь-склад', type: 'PARTNER', price: 510, minDays: 1, maxDays: 3, description: '', cdekTariffCode: 138, deliveryMode: 'pickup', pickupPointKind: 'PVZ' },
  { id: 'o366', name: 'Посылка дверь-постамат', type: 'PARTNER', price: 300, minDays: 2, maxDays: 4, description: '', cdekTariffCode: 366, deliveryMode: 'pickup', pickupPointKind: 'POSTAMAT' },
  { id: 'o137', name: 'Посылка дверь-дверь', type: 'PARTNER', price: 795, minDays: 1, maxDays: 2, description: '', cdekTariffCode: 137, deliveryMode: 'door' },
  { id: 'own1', name: 'Своя доставка', type: 'OWN', price: 150, minDays: 1, maxDays: 1, description: 'Развозим сами' },
];

const PICKUP_POINTS = [{ id: 'pp1', city: 'Москва', address: 'ул. Магазинная, 10' }];

function mockFetch(deliveryOptions: any[], pickupPoints: any[] = []) {
  (window as any).fetch = jest.fn((url: string) => {
    if (/\/delivery\/pickup-points/.test(url))
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: [] }) });
    if (/\/delivery\/calculate/.test(url))
      return Promise.resolve({ ok: true, json: async () => calcData(deliveryOptions, pickupPoints) });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

async function renderWith(section: HTMLElement) {
  runScript(section);
  section.setAttribute('data-last-fias-id', 'fias1');
  document.dispatchEvent(
    new CustomEvent('checkout:address-changed', {
      detail: { cityFiasId: 'fias1', postalCode: '101000' },
    }),
  );
  await flush();
  await flush();
  return section.querySelector('[data-checkout-delivery-list]') as HTMLElement;
}

describe('CheckoutDeliveryMethod — «Вариант A» dedup + понятные лейблы', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('merfy:cartId', 'cart1');
    (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: 'https://gateway.test/api' };
    (window as any).cartStore = { getTotal: () => 100000 };
  });
  afterEach(() => {
    delete (window as any).fetch;
    delete (window as any).__merfyRoot;
    delete (window as any).__MERFY_CONFIG__;
    delete (window as any).cartStore;
  });

  it('постамат-тариф рисуется как «Постамат…», НЕ как «…пункт выдачи»', async () => {
    mockFetch(DEDUP_OPTIONS, PICKUP_POINTS);
    const list = await renderWith(mountDom(true));

    const postamat = list.querySelector(
      '[data-delivery-type="cdek_pickup"][data-delivery-pvz-kind="POSTAMAT"]',
    ) as HTMLElement;
    expect(postamat).not.toBeNull();
    const label = postamat.querySelector('[data-delivery-label]')!.textContent || '';
    expect(label).toContain('Постамат');
    expect(label).not.toContain('пункт');
    // тариф постамата сохранён для создания заказа + фильтра пикера
    expect(postamat.getAttribute('data-delivery-tariff-code')).toBe('366');
    expect(postamat.getAttribute('data-delivery-pvz-kind')).toBe('POSTAMAT');
  });

  it('два ПВЗ-тарифа схлопываются в ОДНУ карточку по дешёвой цене (255, тариф 136)', async () => {
    mockFetch(DEDUP_OPTIONS, PICKUP_POINTS);
    const list = await renderWith(mountDom(true));

    const pvzCards = list.querySelectorAll(
      '[data-delivery-type="cdek_pickup"][data-delivery-pvz-kind="PVZ"]',
    );
    expect(pvzCards.length).toBe(1); // дубль 138 убран
    const pvz = pvzCards[0] as HTMLElement;
    expect(pvz.getAttribute('data-delivery-tariff-code')).toBe('136'); // дешёвый
    expect(pvz.getAttribute('data-delivery-price-cents')).toBe('25500'); // 255₽
    expect(pvz.querySelector('[data-delivery-label]')!.textContent).toContain('Пункт выдачи');
    // дорогой дубль 138 нигде не появляется
    expect(list.querySelector('[data-delivery-tariff-code="138"]')).toBeNull();
  });

  it('курьер (door) рисуется с door-лейблом', async () => {
    mockFetch(DEDUP_OPTIONS, PICKUP_POINTS);
    const list = await renderWith(mountDom(true));

    const door = list.querySelector('[data-delivery-type="cdek_door"]') as HTMLElement;
    expect(door).not.toBeNull();
    expect(door.getAttribute('data-delivery-tariff-code')).toBe('137');
    expect(door.querySelector('[data-delivery-label]')!.textContent).toContain('Курьер СДЭК');
  });

  it('OWN-тариф и самовывоз магазина остаются на месте', async () => {
    mockFetch(DEDUP_OPTIONS, PICKUP_POINTS);
    const list = await renderWith(mountDom(true));

    const own = list.querySelector('[data-delivery-type="custom"]') as HTMLElement;
    expect(own).not.toBeNull();
    expect(own.querySelector('[data-delivery-label]')!.textContent).toContain('Своя доставка');

    const pickup = list.querySelector('[data-delivery-type="self_pickup"]') as HTMLElement;
    expect(pickup).not.toBeNull();
    expect(pickup.querySelector('[data-delivery-label]')!.textContent).toContain('Самовывоз');

    // Итог: 5 карточек (самовывоз + OWN + ПВЗ + постамат + курьер) — дубль 138 схлопнут.
    expect(list.querySelectorAll('[data-delivery-option]').length).toBe(5);
  });

  it('бейдж «дешевле всего» — на единственной самой дешёвой платной карточке', async () => {
    // Без самовывоза/free, чтобы options[0] была платной (OWN 150 — дешевле всех).
    mockFetch(DEDUP_OPTIONS);
    const list = await renderWith(mountDom(false));

    const badges = list.querySelectorAll('[data-delivery-cheapest]');
    expect(badges.length).toBe(1);
    const card = (badges[0] as HTMLElement).closest('[data-delivery-option]') as HTMLElement;
    expect(card.getAttribute('data-delivery-type')).toBe('custom'); // OWN 150₽ — дешевле ПВЗ 255
    expect(card.getAttribute('data-delivery-price-cents')).toBe('15000');
  });
});
