/**
 * @jest-environment jsdom
 *
 * Оплата предложения расширения в чекауте магазина (spec 120, Б10):
 * runtime/checkout-offer.ts. Режим включает только `?offer=<43 символа>`; в нём
 * чекаут берёт позиции из предложения, не создаёт и не трогает корзину
 * покупателя (настоящий window.cartStore не выставляется), не требует
 * регистрации. Без параметра скрипт ничего не делает.
 */
import { CHECKOUT_OFFER_SOURCE } from '../runtime/checkout-offer';

const TOKEN = 'A'.repeat(43);
const API = 'https://gateway.test/api';

const OFFER = {
  state: 'payable',
  editable: true,
  version: 3,
  shopId: 'shop1',
  shopName: 'Лавка',
  deliveryRequired: true,
  email: 'buyer@example.com',
  customerName: null,
  customerPhone: null,
  items: [
    {
      id: 'l1',
      productId: 'p1',
      variantCombinationId: null,
      name: 'Услуга',
      options: { Размер: 'M' },
      variant: 'Размер: M',
      imageUrl: 'https://img.test/1.jpg',
      quantity: 2,
      unitPriceCents: 150000,
      netCents: 300000,
    },
  ],
  subtotalCents: 300000,
  discountCents: 0,
  goodsCents: 300000,
  currency: 'RUB',
};

function setLocation(search: string) {
  delete (window as any).location;
  (window as any).location = {
    search,
    href: `https://shop.test/checkout${search}`,
    origin: 'https://shop.test',
    replace: jest.fn(),
    reload: jest.fn(),
  };
}

function response(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

/** Исполнить скрипт «как в браузере» и дождаться ответа fetch. */
async function runLoader() {
  new Function(CHECKOUT_OFFER_SOURCE).call(window);
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

function recordEvents(): Array<{ name: string; detail: unknown }> {
  const events: Array<{ name: string; detail: unknown }> = [];
  for (const name of [
    'checkout:config-ready',
    'cart:updated',
    'checkout:offer-ready',
    'checkout:offer-error',
  ]) {
    document.addEventListener(name, (e) =>
      events.push({ name, detail: (e as CustomEvent).detail }),
    );
  }
  return events;
}

const realStore = { sentinel: true, syncToServer: jest.fn() };

beforeEach(() => {
  (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: API };
  (window as any).fetch = jest.fn(() => response(200, { success: true, data: OFFER }));
});

afterEach(() => {
  delete (window as any).__merfyOffer;
  delete (window as any).cartStore;
  delete (window as any).__MERFY_CONFIG__;
  delete (window as any).fetch;
  jest.restoreAllMocks();
});

describe('вне режима предложения', () => {
  it.each(['', '?x=1', '?offer=', '?offer=short', `?offer=${'A'.repeat(42)}`, `?offer=${'A'.repeat(44)}`, `?offer=${'A'.repeat(42)}!`])(
    'search=%s — ничего не делает: корзина, конфиг и сеть не тронуты',
    async (search) => {
      setLocation(search);
      (window as any).cartStore = realStore;
      await runLoader();

      expect((window as any).__merfyOffer).toBeUndefined();
      expect((window as any).cartStore).toBe(realStore);
      expect((window as any).__MERFY_CONFIG__.checkout).toBeUndefined();
      expect((window as any).fetch).not.toHaveBeenCalled();
    },
  );
});

describe('режим предложения', () => {
  beforeEach(() => setLocation(`?offer=${TOKEN}`));

  it('настоящая корзина не выставляется: присвоение игнорируется, методы ничего не пишут на сервер и в localStorage', async () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    const removeItem = jest.spyOn(Storage.prototype, 'removeItem');
    await runLoader();

    // Модуль cart-store.js в конце делает именно это присваивание.
    (window as any).cartStore = realStore;
    const store = (window as any).cartStore;
    expect(store).not.toBe(realStore);

    await expect(store.syncToServer({ notify: true })).resolves.toBeNull();
    await expect(store.init()).resolves.toBeNull();
    await expect(store.syncLinesToServer([{}], {})).resolves.toBeNull();
    await expect(store.addItem('p1', null, 1)).resolves.toBe(false);
    await expect(store.removeItem('l1')).resolves.toBe(false);
    await expect(store.updateQuantity('l1', 5)).resolves.toBe(false);
    store.setLocalItems([{ id: 'чужая-позиция' }]);
    store.setLocalItemsReconciled([{ id: 'чужая-позиция' }]);
    store.syncFromCartData({ items: [{ id: 'чужая-позиция' }] });
    store.clear();

    expect(store.getCartId()).toBeNull();
    expect(store.getServerCart()).toBeNull();
    expect(store.getItems().map((i: { id: string }) => i.id)).toEqual(['l1']);
    expect(realStore.syncToServer).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    // Один запрос — чтение предложения; корзин, промокодов и заказов нет.
    expect((window as any).fetch).toHaveBeenCalledTimes(1);
  });

  it('конфиг чекаута: регистрация не требуется (иначе гость ушёл бы на /login)', async () => {
    new Function(CHECKOUT_OFFER_SOURCE).call(window);
    expect((window as any).__MERFY_CONFIG__.checkout).toEqual({
      contactMethod: 'email-phone',
      customerNameMode: 'name-surname',
      addressRequired: true,
      requireCustomerAuth: false,
    });
    expect((window as any).__merfyOffer).toMatchObject({
      token: TOKEN,
      loaded: false,
      data: null,
    });
  });

  it('читает предложение по токену и магазину сайта; позиции — формой корзины, только для чтения', async () => {
    const events = recordEvents();
    await runLoader();

    expect((window as any).fetch).toHaveBeenCalledWith(
      `${API}/pay/${TOKEN}/offer?store_id=shop1`,
      { headers: { Accept: 'application/json' } },
    );
    const offer = (window as any).__merfyOffer;
    expect(offer.loaded).toBe(true);
    expect(offer.data.version).toBe(3);
    const store = (window as any).cartStore;
    expect(store.getItems()).toEqual([
      {
        id: 'l1',
        productId: 'p1',
        variantCombinationId: null,
        name: 'Услуга',
        quantity: 2,
        unitPriceCents: 150000,
        priceCents: 150000,
        imageUrl: 'https://img.test/1.jpg',
        image: 'https://img.test/1.jpg',
        options: { Размер: 'M' },
      },
    ]);
    expect(store.getTotal()).toBe(300000);
    expect(store.getCount()).toBe(2);
    expect(events.map((e) => e.name)).toEqual([
      'checkout:config-ready',
      'cart:updated',
      'checkout:offer-ready',
    ]);
  });

  it('магазин без физической доставки: addressRequired=false уходит в конфиг до config-ready', async () => {
    (window as any).fetch = jest.fn(() =>
      response(200, { success: true, data: { ...OFFER, deliveryRequired: false } }),
    );
    let seen: unknown = null;
    document.addEventListener('checkout:config-ready', () => {
      seen = (window as any).__MERFY_CONFIG__.checkout.addressRequired;
    });
    await runLoader();
    expect(seen).toBe(false);
  });

  it('заказ уже оформлен/оплачен (editable=false): уходим на страницу ссылки шлюза', async () => {
    (window as any).fetch = jest.fn(() =>
      response(200, { success: true, data: { ...OFFER, editable: false, state: 'paid' } }),
    );
    const events = recordEvents();
    await runLoader();

    expect((window as any).location.replace).toHaveBeenCalledWith(
      `${API}/pay/${TOKEN}`,
    );
    expect((window as any).__merfyOffer.loaded).toBe(false);
    expect(events.map((e) => e.name)).not.toContain('checkout:offer-ready');
  });

  it('ссылка недействительна (404): событие с кодом и понятный текст, кнопка не включится', async () => {
    (window as any).fetch = jest.fn(() =>
      response(404, { statusCode: 404, message: 'pay_link_invalid', code: 'pay_link_invalid' }),
    );
    const events = recordEvents();
    await runLoader();

    const offer = (window as any).__merfyOffer;
    expect(offer.loaded).toBe(false);
    expect(events).toEqual([
      { name: 'checkout:offer-error', detail: { code: 'pay_link_invalid' } },
    ]);
    expect(offer.message('pay_link_invalid')).toMatch(/Ссылка недействительна/);
  });

  it('сеть упала — код network; магазин не определён — shop_unknown и без запроса', async () => {
    (window as any).fetch = jest.fn(() => Promise.reject(new Error('offline')));
    const events = recordEvents();
    await runLoader();
    expect(events).toEqual([
      { name: 'checkout:offer-error', detail: { code: 'network' } },
    ]);

    delete (window as any).__merfyOffer;
    (window as any).__MERFY_CONFIG__ = { apiUrl: API };
    (window as any).fetch = jest.fn();
    events.length = 0;
    await runLoader();
    expect((window as any).fetch).not.toHaveBeenCalled();
    expect(events).toEqual([
      { name: 'checkout:offer-error', detail: { code: 'shop_unknown' } },
    ]);
  });

  it('адреса шлюза нет в конфиге страницы — shop_unknown и без запроса (боевой адрес по умолчанию не подставляется)', async () => {
    (window as any).__MERFY_CONFIG__ = { shopId: 'shop1' };
    (window as any).fetch = jest.fn();
    const events = recordEvents();
    await runLoader();
    expect((window as any).fetch).not.toHaveBeenCalled();
    expect(events).toEqual([
      { name: 'checkout:offer-error', detail: { code: 'shop_unknown' } },
    ]);
  });

  it('тексты ошибок оформления: товар по названию, неизвестный код — общий текст', async () => {
    await runLoader();
    const { message } = (window as any).__merfyOffer;
    expect(message('insufficient_stock', { itemName: 'Футболка' })).toBe(
      'Товара «Футболка» нет в нужном количестве. Свяжитесь с продавцом',
    );
    expect(message('insufficient_stock')).toMatch(/нет в нужном количестве/);
    expect(message('offer_changed')).toMatch(/Обновляем страницу/);
    expect(message('delivery_option_unavailable')).toMatch(/Выберите другой/);
    expect(message('что-то-новое')).toMatch(/Не удалось оформить заказ/);
  });

  it('повторный запуск не делает второй запрос', async () => {
    await runLoader();
    new Function(CHECKOUT_OFFER_SOURCE).call(window);
    await new Promise((r) => setTimeout(r, 0));
    expect((window as any).fetch).toHaveBeenCalledTimes(1);
  });
});
