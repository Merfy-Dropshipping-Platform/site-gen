/**
 * @jest-environment jsdom
 *
 * CheckoutDeliveryMethod — CDEK ПВЗ/постамат picker:
 *  - pickup-тариф (deliveryMode 'pickup') рисуется карточкой cdekPvzLabel и при
 *    выборе раскрывает список точек из /delivery/pickup-points;
 *  - точки сортируются ПВЗ→постамат и помечаются бейджем;
 *  - выбор точки эмитит checkout:delivery-changed с pickupPointCode.
 * Скрипт извлекается из .astro и исполняется в jsdom.
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

function mountDom(): HTMLElement {
  document.body.innerHTML = `
    <section data-checkout-delivery-method data-puck-component-id="cdm-1"
             data-cdek-enabled="true"
             data-cdek-door-label="Курьер до двери"
             data-cdek-pvz-label="До пункта выдачи"
             data-pickup-enabled="false"
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

const CALC = {
  success: true,
  data: {
    deliveryOptions: [
      {
        id: 'o138',
        name: 'Посылка дверь-склад',
        type: 'PARTNER',
        price: 510,
        minDays: 1,
        maxDays: 2,
        description: '',
        cdekTariffCode: 138,
        deliveryMode: 'pickup',
      },
    ],
    pickupPoints: [],
  },
};

// POSTAMAT first in payload — порядок должен перевернуться (ПВЗ первым).
const POINTS = {
  success: true,
  data: [
    { code: 'M1', name: 'Постамат 1', address: 'ул Б, 2', workTime: '24/7', type: 'POSTAMAT' },
    { code: 'P1', name: 'ПВЗ 1', address: 'ул А, 1', workTime: 'пн-пт 9-18', type: 'PVZ' },
  ],
};

describe('CheckoutDeliveryMethod — CDEK ПВЗ picker', () => {
  let lastDelivery: any;
  let calcKind: string | null; // pickupPointKind тарифа из calculate (null = старый бэк)
  let calcOptionsOverride: any[] | null; // явный список опций (для мульти-тарифных кейсов)

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('merfy:cartId', 'cart1');
    (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: 'https://gateway.test/api' };
    (window as any).cartStore = { getTotal: () => 100000 };
    calcKind = null;
    calcOptionsOverride = null;
    (window as any).fetch = jest.fn((url: string) => {
      if (/\/delivery\/pickup-points/.test(url))
        return Promise.resolve({ ok: true, json: async () => POINTS });
      if (/\/delivery\/calculate/.test(url))
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions:
                calcOptionsOverride || [{ ...CALC.data.deliveryOptions[0], pickupPointKind: calcKind }],
              pickupPoints: [],
            },
          }),
        });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    lastDelivery = undefined;
    document.addEventListener('checkout:delivery-changed', (e: any) => {
      lastDelivery = e.detail;
    });
  });
  afterEach(() => {
    delete (window as any).fetch;
    delete (window as any).__merfyRoot;
    delete (window as any).__MERFY_CONFIG__;
    delete (window as any).cartStore;
  });

  async function flush(ms = 30) {
    await new Promise((r) => setTimeout(r, ms));
  }

  it('раскрывает список точек под pickup-картой и эмитит pickupPointCode при выборе', async () => {
    const section = mountDom();
    runScript(section);
    // data-last-fias-id ставит address-changed listener; задаём явно для детерминизма
    section.setAttribute('data-last-fias-id', 'fias1');

    document.dispatchEvent(
      new CustomEvent('checkout:address-changed', {
        detail: { cityFiasId: 'fias1', postalCode: '101000' },
      }),
    );
    await flush();
    await flush();

    // Карточка pickup-тарифа с лейблом темы
    const listEl = section.querySelector('[data-checkout-delivery-list]') as HTMLElement;
    expect(listEl.textContent).toContain('До пункта выдачи');
    const card = listEl.querySelector('[data-delivery-type="cdek_pickup"]');
    expect(card).not.toBeNull();

    // Пикер раскрыт, 2 точки, ПВЗ первым (сортировка), бейджи проставлены
    const picker = section.querySelector('[data-cdek-pvz-picker]') as HTMLElement;
    expect(picker.hidden).toBe(false);
    const rows = picker.querySelectorAll('[data-pvz-row]');
    expect(rows.length).toBe(2);
    expect(rows[0].getAttribute('data-pvz-code')).toBe('P1'); // ПВЗ перед постаматом
    expect(picker.textContent).toContain('пвз');
    expect(picker.textContent).toContain('постамат');

    // Выбор точки → событие с pickupPointCode
    (rows[0] as HTMLElement).click();
    expect(lastDelivery).toBeTruthy();
    expect(lastDelivery.type).toBe('cdek_pickup');
    expect(lastDelivery.pickupPointCode).toBe('P1');
    expect(lastDelivery.tariffCode).toBe(138);
  });

  it('смена города сбрасывает выбранную точку (нет утечки кода старого города)', async () => {
    const section = mountDom();
    runScript(section);
    section.setAttribute('data-last-fias-id', 'fias1');
    document.dispatchEvent(
      new CustomEvent('checkout:address-changed', { detail: { cityFiasId: 'fias1', postalCode: '101000' } }),
    );
    await flush();
    await flush();

    const picker = section.querySelector('[data-cdek-pvz-picker]') as HTMLElement;
    (picker.querySelector('[data-pvz-row]') as HTMLElement).click();
    expect(lastDelivery.pickupPointCode).toBe('P1');

    // Город сменился → автоселект pickup-карты должен эмитить уже БЕЗ кода
    section.setAttribute('data-last-fias-id', 'fias2');
    document.dispatchEvent(
      new CustomEvent('checkout:address-changed', { detail: { cityFiasId: 'fias2', postalCode: '190000' } }),
    );
    await flush();
    await flush();

    expect(lastDelivery.type).toBe('cdek_pickup');
    expect(lastDelivery.pickupPointCode).toBeNull();
  });

  it('PVZ-тариф показывает только ПВЗ (постаматы скрыты)', async () => {
    calcKind = 'PVZ';
    const section = mountDom();
    runScript(section);
    section.setAttribute('data-last-fias-id', 'fias1');
    document.dispatchEvent(
      new CustomEvent('checkout:address-changed', { detail: { cityFiasId: 'fias1', postalCode: '101000' } }),
    );
    await flush();
    await flush();

    const picker = section.querySelector('[data-cdek-pvz-picker]') as HTMLElement;
    const rows = picker.querySelectorAll('[data-pvz-row]');
    expect(rows.length).toBe(1);
    expect(rows[0].getAttribute('data-pvz-code')).toBe('P1'); // ПВЗ
    expect(picker.textContent).not.toContain('постамат');
  });

  it('постамат-тариф показывает только постаматы (ПВЗ скрыты)', async () => {
    calcKind = 'POSTAMAT';
    const section = mountDom();
    runScript(section);
    section.setAttribute('data-last-fias-id', 'fias1');
    document.dispatchEvent(
      new CustomEvent('checkout:address-changed', { detail: { cityFiasId: 'fias1', postalCode: '101000' } }),
    );
    await flush();
    await flush();

    const picker = section.querySelector('[data-cdek-pvz-picker]') as HTMLElement;
    const rows = picker.querySelectorAll('[data-pvz-row]');
    expect(rows.length).toBe(1);
    expect(rows[0].getAttribute('data-pvz-code')).toBe('M1'); // постамат
  });

  it('переключение ПВЗ-тариф → постамат-тариф в одном городе сбрасывает точку', async () => {
    // Две pickup-опции разного типа; дешёвая (ПВЗ, 510) автоселектится первой.
    calcOptionsOverride = [
      { id: 'o138', name: 'дверь-склад', type: 'PARTNER', price: 510, minDays: 1, maxDays: 2, description: '', cdekTariffCode: 138, deliveryMode: 'pickup', pickupPointKind: 'PVZ' },
      { id: 'o366', name: 'дверь-постамат', type: 'PARTNER', price: 520, minDays: 1, maxDays: 2, description: '', cdekTariffCode: 366, deliveryMode: 'pickup', pickupPointKind: 'POSTAMAT' },
    ];
    const section = mountDom();
    runScript(section);
    section.setAttribute('data-last-fias-id', 'fias1');
    document.dispatchEvent(
      new CustomEvent('checkout:address-changed', { detail: { cityFiasId: 'fias1', postalCode: '101000' } }),
    );
    await flush();
    await flush();

    // Выбираем ПВЗ-точку под ПВЗ-тарифом
    const picker = section.querySelector('[data-cdek-pvz-picker]') as HTMLElement;
    (picker.querySelector('[data-pvz-row]') as HTMLElement).click();
    expect(lastDelivery.pickupPointCode).toBe('P1');

    // Переключаемся на постамат-тариф (тот же город) → старый ПВЗ-код невалиден
    const list = section.querySelector('[data-checkout-delivery-list]') as HTMLElement;
    const postamatCard = list.querySelector('[data-delivery-tariff-code="366"]') as HTMLElement;
    expect(postamatCard).not.toBeNull();
    postamatCard.click();
    await flush();

    expect(lastDelivery.type).toBe('cdek_pickup');
    expect(lastDelivery.pickupPointCode).toBeNull();
  });

  it('поиск фильтрует точки по адресу', async () => {
    const section = mountDom();
    runScript(section);
    section.setAttribute('data-last-fias-id', 'fias1');
    document.dispatchEvent(
      new CustomEvent('checkout:address-changed', {
        detail: { cityFiasId: 'fias1', postalCode: '101000' },
      }),
    );
    await flush();
    await flush();

    const picker = section.querySelector('[data-cdek-pvz-picker]') as HTMLElement;
    const search = picker.querySelector('[data-pvz-search]') as HTMLInputElement;
    expect(search).not.toBeNull();
    search.value = 'ул А';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    const rows = picker.querySelectorAll('[data-pvz-row]');
    expect(rows.length).toBe(1);
    expect(rows[0].getAttribute('data-pvz-code')).toBe('P1');
  });
});
