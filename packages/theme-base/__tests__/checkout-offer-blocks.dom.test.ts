/**
 * @jest-environment jsdom
 *
 * Остальные блоки чекаута в режиме оплаты предложения расширения
 * (`/checkout?offer=…`, spec 120 Б10): доставка, контакты, сводка и итоги.
 * Общее правило: источник позиций — предложение, корзина покупателя не нужна и
 * не подмешивается; вне режима (нет window.__merfyOffer) блоки ведут себя прежде.
 */
import { join } from 'path';
import { astroInlineRunners } from './helpers/astro-inline-script';

const BLOCKS = join(__dirname, '..', 'blocks');
const DELIVERY = join(BLOCKS, 'CheckoutDeliveryMethod', 'CheckoutDeliveryMethod.astro');
const CONTACT = join(BLOCKS, 'CheckoutContactForm', 'CheckoutContactForm.astro');
const SUMMARY = join(BLOCKS, 'CheckoutOrderSummary', 'CheckoutOrderSummary.astro');
const TOTALS = join(BLOCKS, 'CheckoutTotals', 'CheckoutTotals.astro');

const TOKEN = 'T'.repeat(43);
const API = 'https://gateway.test/api';

const LINES = [
  { id: 'l1', productId: 'p1', name: 'Услуга', quantity: 2, unitPriceCents: 150000, priceCents: 150000, options: {} },
];

const OPTIONS = [
  { id: 'own-1', name: 'Курьер магазина', type: 'OWN', price: 300, carrier: null, mode: 'own', requiresPickupPoint: false, label: 'Курьер магазина' },
  { id: 'door', name: 'Курьер', type: 'PARTNER', price: 390, minDays: 2, maxDays: 4, carrier: 'cdek', mode: 'door', tariffCode: '137', requiresPickupPoint: false, shipmentRequired: true, label: 'Курьер до двери' },
];

function setOffer(loaded: boolean, data: Record<string, unknown> = {}) {
  (window as any).__merfyOffer = {
    token: TOKEN,
    loaded,
    error: '',
    data: loaded ? { version: 2, email: 'buyer@example.com', customerPhone: '+79991112233', deliveryRequired: true, ...data } : null,
    message: (code: string) => `текст:${code}`,
  };
}

function setStore(items: unknown[] = LINES) {
  (window as any).cartStore = {
    getItems: () => items,
    getTotal: () =>
      (items as typeof LINES).reduce((s, l) => s + (l.unitPriceCents || 0) * (l.quantity || 1), 0),
    getServerCart: () => null,
  };
}

async function flush(ms = 30) {
  await new Promise((r) => setTimeout(r, ms));
}

afterEach(() => {
  delete (window as any).fetch;
  delete (window as any).__merfyRoot;
  delete (window as any).__merfyOffer;
  delete (window as any).__MERFY_CONFIG__;
  delete (window as any).cartStore;
  localStorage.clear();
});

// ── Доставка ──────────────────────────────────────────────────────────────────
describe('CheckoutDeliveryMethod — оплата предложения', () => {
  function mount(): HTMLElement {
    document.body.innerHTML = `
      <section data-checkout-delivery-method data-puck-component-id="cdm-1"
               data-pickup-enabled="true" data-pickup-label="Самовывоз"
               data-free-shipping-threshold="1000">
        <div data-checkout-delivery-empty></div>
        <div data-checkout-delivery-loading hidden></div>
        <div data-checkout-delivery-error hidden></div>
        <div data-checkout-delivery-list hidden></div>
        <div data-cdek-pvz-picker hidden></div>
      </section>`;
    const section = document.querySelector('[data-checkout-delivery-method]') as HTMLElement;
    (window as any).__merfyRoot = () => section;
    return section;
  }
  const run = () => astroInlineRunners(DELIVERY)[0].run({ blockId: 'cdm-1' });
  const calls = () => ((window as any).fetch as jest.Mock).mock.calls.map((c) => String(c[0]));

  beforeEach(() => {
    (window as any).__MERFY_CONFIG__ = {
      shopId: 'shop1', apiUrl: API, checkout: { addressRequired: true },
    };
    (window as any).fetch = jest.fn((url: string) => {
      if (/\/offer\/pickup-points/.test(url)) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true, data: [{ code: 'MSK1', name: 'ПВЗ', address: 'Москва, Тверская 7', workTime: '9-18', type: 'PVZ' }] }) });
      }
      if (/\/offer\/delivery/.test(url)) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { deliveryOptions: OPTIONS, pickupPoints: [{ id: 'pp1', address: 'Склад' }] } }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  it('без корзины и merfy:cartId: после загрузки предложения варианты считает /pay/<токен>/offer/delivery', async () => {
    setStore();
    setOffer(false);
    const section = mount();
    run();
    document.dispatchEvent(new CustomEvent('checkout:config-ready'));
    await flush();
    // Пока предложение не загрузилось, расчёта нет (позиции и токен не приняты).
    expect(calls()).toEqual([]);

    (window as any).__merfyOffer.loaded = true;
    (window as any).__merfyOffer.data = { version: 2 };
    document.dispatchEvent(new CustomEvent('checkout:offer-ready'));
    await flush();

    expect(calls()).toEqual([`${API}/pay/${TOKEN}/offer/delivery?store_id=shop1`]);
    expect(localStorage.getItem('merfy:cartId')).toBeNull();
    const list = section.querySelector('[data-checkout-delivery-list]') as HTMLElement;
    // Адреса ещё нет: свои тарифы и самовывоз магазина, перевозчики ждут город.
    const types = Array.from(list.querySelectorAll('[data-delivery-option]')).map((c) => c.getAttribute('data-delivery-type'));
    expect(types).toEqual(expect.arrayContaining(['custom', 'self_pickup']));
    expect(types).not.toContain('cdek_door');
  });

  it('адрес введён: город и индекс уходят в расчёт предложения, перевозчик появляется', async () => {
    setStore();
    setOffer(true);
    const section = mount();
    run();
    document.dispatchEvent(new CustomEvent('checkout:address-changed', {
      detail: { cityFiasId: 'fias1', postalCode: '101000', city: 'Москва' },
    }));
    await flush();

    const call = ((window as any).fetch as jest.Mock).mock.calls.find((c) => /offer\/delivery/.test(String(c[0])));
    expect(JSON.parse(call[1].body)).toMatchObject({ cityFiasId: 'fias1', postalCode: '101000' });
    const list = section.querySelector('[data-checkout-delivery-list]') as HTMLElement;
    expect(list.querySelector('[data-delivery-type="cdek_door"]')).not.toBeNull();
  });

  it('порог бесплатной доставки блока в предложении не действует: цена — из расчёта сервера', async () => {
    setStore(); // подытог 3000 ₽ > порога 10 ₽ блока
    setOffer(true);
    const section = mount();
    run();
    document.dispatchEvent(new CustomEvent('checkout:address-changed', {
      detail: { cityFiasId: 'fias1', postalCode: '101000' },
    }));
    await flush();
    const door = section.querySelector('[data-delivery-type="cdek_door"]') as HTMLElement;
    expect(door.getAttribute('data-delivery-price-cents')).toBe('39000');
    expect(door.hasAttribute('data-free-shipping')).toBe(false);
  });

  it('пункты выдачи: /pay/<токен>/offer/pickup-points, не маршрут корзины', async () => {
    setStore();
    setOffer(true);
    const section = mount();
    run();
    document.dispatchEvent(new CustomEvent('checkout:address-changed', {
      detail: { cityFiasId: 'fias1', postalCode: '101000' },
    }));
    await flush();
    const pvz = {
      ...OPTIONS[1], id: 'pvz', mode: 'pickup', tariffCode: '136', requiresPickupPoint: true,
      pickupPointKind: 'PVZ', label: 'Пункт выдачи',
    };
    (window as any).fetch = jest.fn((url: string) => {
      if (/\/offer\/pickup-points/.test(url)) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true, data: [{ code: 'MSK1', name: 'ПВЗ', address: 'Москва, Тверская 7', workTime: '9-18', type: 'PVZ' }] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { deliveryOptions: [pvz], pickupPoints: [] } }) });
    });
    document.dispatchEvent(new CustomEvent('checkout:address-changed', {
      detail: { cityFiasId: 'fias2', postalCode: '101000' },
    }));
    await flush();
    await flush();

    const urls = calls();
    expect(urls.some((u) => u.startsWith(`${API}/pay/${TOKEN}/offer/pickup-points?store_id=shop1`))).toBe(true);
    expect(urls.some((u) => /\/store\/carts\//.test(u))).toBe(false);
    expect(section.querySelector('[data-pvz-row]')).not.toBeNull();
  });

  it('отказ сервера: текст из предложения (код не показываем)', async () => {
    setStore();
    setOffer(true);
    (window as any).fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 404, json: async () => ({ code: 'pay_link_invalid', message: 'pay_link_invalid' }) }));
    const section = mount();
    run();
    document.dispatchEvent(new CustomEvent('checkout:address-changed', {
      detail: { cityFiasId: 'fias1', postalCode: '101000' },
    }));
    await flush();
    const err = section.querySelector('[data-checkout-delivery-error]') as HTMLElement;
    expect(err.hidden).toBe(false);
    expect(err.textContent).toBe('текст:pay_link_invalid');
  });

  it('магазин без физической доставки: секция скрыта, расчёта нет', async () => {
    (window as any).__MERFY_CONFIG__.checkout = { addressRequired: false };
    setStore();
    setOffer(true, { deliveryRequired: false });
    const section = mount();
    run();
    document.dispatchEvent(new CustomEvent('checkout:config-ready'));
    await flush();
    expect(section.hidden).toBe(true);
    expect(calls()).toEqual([]);
  });

  it('вне режима: расчёт по корзине, порог бесплатной доставки блока действует', async () => {
    localStorage.setItem('merfy:cartId', 'cart1');
    setStore();
    const section = mount();
    (window as any).fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ success: true, data: { deliveryOptions: OPTIONS, pickupPoints: [] } }) }));
    run();
    document.dispatchEvent(new CustomEvent('checkout:address-changed', {
      detail: { cityFiasId: 'fias1', postalCode: '101000' },
    }));
    await flush();

    // Старт блока и смена адреса считают по маршруту корзины; маршрутов предложения нет.
    expect(calls().length).toBeGreaterThan(0);
    for (const u of calls()) {
      expect(u).toBe(`${API}/store/carts/cart1/delivery/calculate?store_id=shop1`);
    }
    const door = section.querySelector('[data-delivery-type="cdek_door"]') as HTMLElement;
    // порог 1000 копеек < подытога 3000 ₽ → платные тарифы бесплатны, как раньше
    expect(door.getAttribute('data-delivery-price-cents')).toBe('0');
  });
});

// ── Контакты ──────────────────────────────────────────────────────────────────
describe('CheckoutContactForm — оплата предложения', () => {
  function mount(): HTMLElement {
    document.body.innerHTML = `
      <section data-checkout-contact data-puck-component-id="cc-1">
        <div data-checkout-field="email"><input name="email" /></div>
        <div data-checkout-field="phone" data-format="ru" hidden><input name="phone" data-checkout-phone /></div>
      </section>`;
    const root = document.querySelector('[data-checkout-contact]') as HTMLElement;
    (window as any).__merfyRoot = () => root;
    return root;
  }
  const runConfig = () => astroInlineRunners(CONTACT)[1].run({ blockId: 'cc-1', fieldFullClass: 'full' });

  it('телефон виден всегда, почта из заказа закрыта от правки, телефон из заказа подставлен', () => {
    (window as any).__MERFY_CONFIG__ = { checkout: { requireCustomerAuth: false } };
    setOffer(true);
    const root = mount();
    runConfig();
    document.dispatchEvent(new CustomEvent('checkout:offer-ready'));

    const email = root.querySelector('[data-checkout-field="email"] input') as HTMLInputElement;
    const phone = root.querySelector('[data-checkout-field="phone"] input') as HTMLInputElement;
    expect((root.querySelector('[data-checkout-field="phone"]') as HTMLElement).hidden).toBe(false);
    expect(email.value).toBe('buyer@example.com');
    expect(email.readOnly).toBe(true);
    expect(phone.value).not.toBe('');
    expect(phone.readOnly).toBe(false);
  });

  it('введённый покупателем телефон не затирается данными заказа', () => {
    (window as any).__MERFY_CONFIG__ = { checkout: {} };
    setOffer(true);
    const root = mount();
    (root.querySelector('[data-checkout-field="phone"] input') as HTMLInputElement).value = '+7 (900) 000-00-00';
    runConfig();
    document.dispatchEvent(new CustomEvent('checkout:offer-ready'));
    expect((root.querySelector('[data-checkout-field="phone"] input') as HTMLInputElement).value).toBe('+7 (900) 000-00-00');
  });

  it('вне режима: телефон скрыт, почта свободна (регистрация необязательна)', () => {
    (window as any).__MERFY_CONFIG__ = { checkout: { requireCustomerAuth: false } };
    const root = mount();
    runConfig();
    expect((root.querySelector('[data-checkout-field="phone"]') as HTMLElement).hidden).toBe(true);
    expect((root.querySelector('[data-checkout-field="email"] input') as HTMLInputElement).readOnly).toBe(false);
  });
});

// ── Сводка и итоги ────────────────────────────────────────────────────────────
describe('CheckoutOrderSummary / CheckoutTotals — оплата предложения', () => {
  function mountSummary(): HTMLElement {
    document.body.innerHTML = `
      <section data-checkout-summary data-puck-component-id="cs-1" data-show-variant-labels="true">
        <div data-checkout-loading></div>
        <div data-checkout-empty hidden></div>
        <div data-checkout-items></div>
        <div data-checkout-promo-wrap hidden>
          <div data-checkout-promo><input data-checkout-promo-input /><button data-checkout-promo-apply></button></div>
          <div data-checkout-promo-applied hidden><span data-checkout-promo-applied-code></span><button data-checkout-promo-remove></button></div>
          <div data-checkout-promo-error hidden></div>
        </div>
      </section>`;
    const section = document.querySelector('[data-checkout-summary]') as HTMLElement;
    (window as any).__merfyRoot = () => section;
    return section;
  }

  beforeEach(() => {
    (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: API };
    // Корзина покупателя в локальном хранилище темы — в предложении её не видно.
    localStorage.setItem('flux:cart:v1', JSON.stringify([{ id: 'x', productId: 'чужой-товар', name: 'Чужой товар', price: '10', quantity: 1 }]));
  });

  it('сводка показывает только позиции предложения, поле промокода скрыто', () => {
    setOffer(true);
    setStore();
    const section = mountSummary();
    astroInlineRunners(SUMMARY)[0].run({ blockId: 'cs-1' });
    document.dispatchEvent(new CustomEvent('cart:updated'));

    const items = section.querySelector('[data-checkout-items]') as HTMLElement;
    expect(items.textContent).toContain('Услуга');
    expect(items.textContent).not.toContain('Чужой товар');
    expect((section.querySelector('[data-checkout-promo-wrap]') as HTMLElement).hidden).toBe(true);
  });

  it('предложение ещё грузится: локальная корзина покупателя не подставляется', () => {
    setOffer(false);
    setStore([]);
    const section = mountSummary();
    astroInlineRunners(SUMMARY)[0].run({ blockId: 'cs-1' });
    document.dispatchEvent(new CustomEvent('cart:updated'));
    expect((section.querySelector('[data-checkout-items]') as HTMLElement).textContent).not.toContain('Чужой товар');
    expect((section.querySelector('[data-checkout-empty]') as HTMLElement).hidden).toBe(false);
  });

  it('вне режима: пустая серверная корзина — позиции из локальной корзины темы, промокод виден', () => {
    (window as any).cartStore = { getItems: () => [], getTotal: () => 0 };
    const section = mountSummary();
    astroInlineRunners(SUMMARY)[0].run({ blockId: 'cs-1' });
    document.dispatchEvent(new CustomEvent('cart:updated'));
    expect((section.querySelector('[data-checkout-items]') as HTMLElement).textContent).toContain('Чужой товар');
    expect((section.querySelector('[data-checkout-promo-wrap]') as HTMLElement).hidden).toBe(false);
  });

  describe('итоги', () => {
    function mountTotals(): HTMLElement {
      document.body.innerHTML = `
        <section data-checkout-totals data-puck-component-id="ct-1" data-free-text="Бесплатно">
          <div data-totals-subtotal></div>
          <div data-totals-discount-row hidden><span data-totals-discount></span></div>
          <div data-totals-delivery></div>
          <div data-totals-total></div>
          <div data-ext-point="checkout"></div>
        </section>`;
      const section = document.querySelector('[data-checkout-totals]') as HTMLElement;
      (window as any).__merfyRoot = () => section;
      return section;
    }
    const text = (s: HTMLElement, sel: string) => (s.querySelector(sel) as HTMLElement).textContent || '';

    it('подытог — по позициям предложения, доставка из выбора добавляется в итог', () => {
      setOffer(true);
      setStore();
      const section = mountTotals();
      const [main] = astroInlineRunners(TOTALS);
      main.run({ blockId: 'ct-1' });
      document.dispatchEvent(new CustomEvent('cart:updated'));
      document.dispatchEvent(new CustomEvent('checkout:delivery-changed', { detail: { costCents: 39000 } }));

      expect(text(section, '[data-totals-subtotal]').replace(/\s/g, '')).toBe('3000₽');
      expect(text(section, '[data-totals-total]').replace(/\s/g, '')).toBe('3390₽');
    });

    it('точка расширений «Оформление заказа» в предложении не монтируется; вне режима монтируется с корзиной', () => {
      const mount = jest.fn();
      (window as any).mountExtensionPoint = mount;
      (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: API };
      setStore();
      mountTotals();
      const scripts = astroInlineRunners(TOTALS);
      const extScript = scripts[scripts.length - 1];

      setOffer(true);
      extScript.run({ blockId: 'ct-1' });
      expect(mount).not.toHaveBeenCalled();

      delete (window as any).__merfyOffer;
      localStorage.setItem('merfy:cartId', 'cart1');
      extScript.run({ blockId: 'ct-1' });
      expect(mount).toHaveBeenCalledWith(expect.anything(), { point: 'checkout', storeId: 'shop1', cartId: 'cart1' });
      delete (window as any).mountExtensionPoint;
    });
  });
});
