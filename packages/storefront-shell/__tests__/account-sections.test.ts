import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import accountScript from '../sections/account/script';
import ordersScript from '../sections/orders/script';
import { CUSTOMER_TOKEN_KEY } from '../src/core/customer-token';
import { cart } from '../src/core/parts/cart';
import { favorites } from '../src/core/parts/favorites';
import { navigation } from '../src/core/navigation';
import { auth } from '../src/core/parts/auth';
import { customer } from '../src/core/parts/customer';
import { ORDER_MISSING_TEXT, orders } from '../src/core/parts/orders';
import { start, type StartedCore } from '../src/core/start';
import { configTag, entry, placeSection, watchFailures } from './core-support';
import headerScript from '../../storefront-sections/fixtures/shop/header/script';
import { fakeGateway } from './sdk-support';

// «Личный кабинет» и «Заказы» (блок 10 «Секций и SDK», 10.8, «Решил сам» п. 20; часть 10в, Р10в-12, Р10в-13): данные —
// ctx.auth.$customer и ctx.orders; тексты — как у flux; страницы только для вошедших — токен в тестах есть.
const here = dirname(fileURLToPath(import.meta.url));
const source = (path: string): string => readFileSync(join(here, path), 'utf8');
const ACCOUNT_TEMPLATE = source('../sections/account/template.astro');
const ORDERS_TEMPLATE = source('../sections/orders/template.astro');
const ACCOUNT = `
  <p data-ref="loading">Загрузка...</p>
  <span data-ref="email-display"></span>
  <form data-ref="form" hidden>
    <input data-ref="email" type="email" disabled>
    <input data-ref="phone" type="tel">
    <p data-ref="status" hidden></p>
    <button type="button" data-ref="save" data-action="save">Сохранить</button>
    <button type="button" data-action="auth.signout">Выйти из аккаунта</button>
  </form>`;
const ORDERS = `
  <span data-ref="email"></span>
  <div data-ref="list-view">
    <p data-ref="loading">Загрузка...</p>
    <p data-ref="empty" hidden>У вас пока нет заказов</p>
    <p data-ref="error" role="alert" hidden></p>
    <ul data-ref="orders"><template><li>
      <span data-ref="number"></span><span data-ref="date"></span><span data-ref="status"></span>
      <a data-ref="open" href="/account/orders">Перейти</a>
    </li></template></ul>
  </div>
  <div data-ref="order-view" hidden>
    <p data-ref="order-error" role="alert" hidden></p>
    <div data-ref="order-body">
      <span data-ref="order-subtitle"></span><span data-ref="order-meta"></span>
      <span data-ref="order-number"></span><span data-ref="order-status"></span>
      <div data-ref="address-row"><span data-ref="order-address"></span></div>
      <span data-ref="order-total"></span>
      <ul data-ref="lines"><template><li>
        <img data-ref="image" alt=""><span data-ref="title"></span><span data-ref="options"></span>
        <span data-ref="quantity"></span><span data-ref="total"></span>
      </li></template></ul>
      <button type="button" data-ref="cancel-open" hidden>Отменить заказ</button>
      <textarea data-ref="reason"></textarea>
      <p data-ref="cancel-error" role="alert" hidden></p>
      <button type="button" data-action="cancel-confirm">Подтвердить отмену</button>
    </div>
  </div>`;
const TOKEN = 't-customer-1';
const STORE_UNMOUNT_DELAY = 1000;
const ANNA = { id: 'c-1', email: 'anna@example.ru', name: 'Анна', phone: '+79001234567' };
const ORDER = {
  orderNumber: '1042',
  createdAt: '2026-10-20T10:00:00.000Z',
  status: 'paid',
  totalCents: 498000,
  shippingAddress: { city: 'Москва', street: 'Тверская', building: '7' },
  deliveryStatus: null,
  items: [
    {
      name: 'Шарф «Нова»',
      imageUrl: null,
      options: { Цвет: 'Красный' },
      quantity: 2,
      totalCents: 498000,
      isBonus: false,
    },
    { name: 'Платок', imageUrl: null, options: null, quantity: 1, totalCents: 0, isBonus: true },
  ],
};
const realLocation = window.location;
let core: StartedCore | undefined;
let failures: ReturnType<typeof watchFailures>;
let go: ReturnType<typeof vi.spyOn>;
let reload: ReturnType<typeof vi.fn>;

// window.location.reload в jsdom «Not implemented», а само свойство reload нельзя подменить даже прокси (non-
// configurable): адрес страницы в тестах — копия настоящего с reload-заглушкой.
// Значение — unknown: типы у window.location в defineProperty, каст не нужен.
const stubLocation = (): unknown => ({
  get hash() { return realLocation.hash; },
  get host() { return realLocation.host; },
  get hostname() { return realLocation.hostname; },
  get href() { return realLocation.href; },
  get origin() { return realLocation.origin; },
  get pathname() { return realLocation.pathname; },
  get port() { return realLocation.port; },
  get protocol() { return realLocation.protocol; },
  get search() { return realLocation.search; },
  reload,
  toString: () => realLocation.href,
});

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await vi.advanceTimersByTimeAsync(0);
};
const hidden = (root: Element, ref: string): boolean | undefined =>
  root.querySelector(`[data-ref="${ref}"]`)?.hasAttribute('hidden');
const text = (root: Element, ref: string): string =>
  root.querySelector(`[data-ref="${ref}"]`)?.textContent?.trim() ?? '';
const texts = (root: Element, ref: string): string[] =>
  [...root.querySelectorAll(`[data-ref="${ref}"]`)]
    .filter((el) => !el.closest('template'))
    .map((el) => el.textContent?.trim() ?? '');
const valueOf = (root: Element, ref: string): string =>
  root.querySelector<HTMLInputElement>(`[data-ref="${ref}"]`)?.value ?? '';
const type = (root: Element, ref: string, value: string): void => {
  const input = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-ref="${ref}"]`);
  if (input) input.value = value;
};
const click = (root: Element, selector: string): void => root.querySelector<HTMLElement>(selector)?.click();
const pageTag = (mode: 'live' | 'preview', id: string, path: string): string =>
  configTag(mode).replace('"page":{"id":"home","path":"/"}', `"page":{"id":"${id}","path":"${path}"}`);
const meAnswer = { status: 200, body: { success: true, data: { customer: ANNA, session: {} } } };

function openAccount(mode: 'live' | 'preview' = 'live') {
  window.history.replaceState(null, '', '/account/profile');
  const gateway = fakeGateway();
  document.head.innerHTML = pageTag(mode, 'page-profile', '/account/profile');
  const page = placeSection('shop:account', 'account-1', ACCOUNT);
  return {
    gateway,
    page,
    run: () => (core = start({ parts: [auth], sections: [entry('shop:account', accountScript, { uses: ['auth'] })] })),
  };
}

function openOrders(address = '/account/orders', mode: 'live' | 'preview' = 'live') {
  window.history.replaceState(null, '', address);
  const gateway = fakeGateway();
  document.head.innerHTML = pageTag(mode, 'page-orders', '/account/orders');
  const page = placeSection('shop:orders', 'orders-1', ORDERS);
  return {
    gateway,
    page,
    run: () =>
      (core = start({
        parts: [auth, orders, customer],
        sections: [entry('shop:orders', ordersScript, { uses: ['orders', 'customer'] })],
      })),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
  failures = watchFailures();
  go = vi.spyOn(navigation, 'go').mockImplementation(() => undefined);
  reload = vi.fn();
  Object.defineProperty(window, 'location', { value: stubLocation(), configurable: true, writable: true });
});

afterEach(async () => {
  core?.stop();
  core = undefined;
  await vi.advanceTimersByTimeAsync(STORE_UNMOUNT_DELAY * 2);
  failures.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(window, 'location', { value: realLocation, configurable: true, writable: true });
  window.history.replaceState(null, '', '/');
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe('шаблоны кабинета', () => {
  it('ссылки разметки и тексты flux', () => {
    for (const part of ACCOUNT.match(/data-(?:ref|action)="[^"]+"/g) ?? []) expect(ACCOUNT_TEMPLATE).toContain(part);
    for (const part of ORDERS.match(/data-(?:ref|action)="[^"]+"/g) ?? []) expect(ORDERS_TEMPLATE).toContain(part);
    for (const part of ['Основные данные', 'Мои заказы', 'Выйти из аккаунта', '+7 (000) 000-00-00', '/wishlist'])
      expect(ACCOUNT_TEMPLATE).toContain(part);
    for (const part of [
      'У вас пока нет заказов',
      'Вернуться к заказам',
      'После отмены восстановить заказ невозможно.',
      'Нет, оставить',
      'Перейти',
    ])
      expect(ORDERS_TEMPLATE).toContain(part);
  });

  it('навигация кабинета: текущая страница и ссылки на заказы и избранное', () => {
    expect(ACCOUNT_TEMPLATE).toContain('aria-current="page"');
    expect(ACCOUNT_TEMPLATE).toContain('href="/account/orders"');
    expect(ACCOUNT_TEMPLATE).toContain('href="/wishlist"');
  });

  it('отмена заказа — окно behavior dialog с открытием и закрытием', () => {
    expect(ORDERS_TEMPLATE).toContain('data-behavior="dialog"');
    expect(ORDERS_TEMPLATE).toContain('data-part="open"');
    expect(ORDERS_TEMPLATE).toContain('data-part="close"');
  });
});

describe('«Личный кабинет»', () => {
  it('до ответа — «Загрузка...»; потом форма с e-mail и телефоном, e-mail в подзаголовке', async () => {
    const { gateway, page, run } = openAccount();
    gateway.answer('GET /store/auth/me', meAnswer);
    run();
    expect([hidden(page, 'loading'), hidden(page, 'form')]).toEqual([false, true]);
    await settle();
    expect([hidden(page, 'loading'), hidden(page, 'form')]).toEqual([true, false]);
    expect([valueOf(page, 'email'), valueOf(page, 'phone'), text(page, 'email-display')]).toEqual([
      'anna@example.ru',
      '+79001234567',
      'anna@example.ru',
    ]);
  });

  it('«Сохранить» — PATCH profile с телефоном, «Сохранено!»; сбой — «Не удалось сохранить», сбоя секции нет', async () => {
    const { gateway, page, run } = openAccount();
    gateway.answer('GET /store/auth/me', meAnswer);
    gateway.answer(
      'PATCH /store/auth/profile',
      { status: 200, body: { success: true, data: { ...ANNA, phone: '+79001234500' } } },
      { status: 500, body: { success: false } },
    );
    run();
    await settle();
    type(page, 'phone', ' +79001234500 ');
    click(page, '[data-action="save"]');
    await settle();
    expect(gateway.calls.at(-1)).toEqual({ key: 'PATCH /store/auth/profile', body: { phone: '+79001234500' } });
    expect([hidden(page, 'status'), text(page, 'status')]).toEqual([false, 'Сохранено!']);
    click(page, '[data-action="save"]');
    await settle();
    expect(text(page, 'status')).toBe('Не удалось сохранить');
    expect(failures.details).toEqual([]);
  });

  it('«Выйти из аккаунта» — POST logout, переход на «Вход»', async () => {
    const { gateway, page, run } = openAccount();
    gateway.answer('GET /store/auth/me', meAnswer);
    gateway.answer('POST /store/auth/logout', { status: 200, body: { success: true } });
    run();
    await settle();
    click(page, '[data-action="auth.signout"]');
    await settle();
    expect(gateway.keys().at(-1)).toBe('POST /store/auth/logout');
    expect(localStorage.getItem(CUSTOMER_TOKEN_KEY)).toBeNull();
    expect(go).toHaveBeenCalledWith('/login');
  });

  it('превью: форма без данных, запросов нет', async () => {
    const { gateway, page, run } = openAccount('preview');
    run();
    await settle();
    expect([hidden(page, 'form'), valueOf(page, 'email'), gateway.calls.length]).toEqual([false, '', 0]);
  });
});

describe('«Заказы»', () => {
  it('список: номер, дата, статус, «Перейти» на заказ; e-mail в подзаголовке', async () => {
    const { gateway, page, run } = openOrders();
    gateway.answer('GET /store/auth/me', meAnswer);
    gateway.answer('GET /store/orders', {
      status: 200,
      body: { success: true, data: [ORDER, { ...ORDER, orderNumber: '1043', status: 'sent' }] },
    });
    run();
    await settle();
    expect(texts(page, 'number')).toEqual(['Заказ №1042', 'Заказ №1043']);
    expect(texts(page, 'status')).toEqual(['Оплачен', 'Отправлен']);
    expect(texts(page, 'date')[0]).toBe('от 20.10.2026');
    expect(text(page, 'email')).toBe('anna@example.ru');
    expect(page.querySelector('[data-ref="open"]')?.getAttribute('href')).toBe('/account/orders?n=1042');
    expect([hidden(page, 'loading'), hidden(page, 'empty'), hidden(page, 'order-view')]).toEqual([true, true, true]);
  });

  it('пусто — «У вас пока нет заказов»; сбой — «Не удалось загрузить заказы»', async () => {
    const first = openOrders();
    first.gateway.answer('GET /store/orders', { status: 200, body: { success: true, data: [] } });
    first.run();
    await settle();
    expect(hidden(first.page, 'empty')).toBe(false);
    core?.stop();
    document.body.replaceChildren();
    const second = openOrders();
    second.gateway.answer('GET /store/orders', { status: 500, body: { success: false } });
    second.run();
    await settle();
    expect([hidden(second.page, 'error'), text(second.page, 'error')]).toEqual([false, 'Не удалось загрузить заказы']);
    expect(failures.details).toEqual([]);
  });

  it('?n= — заказ: подзаголовок, мета, ячейки, строки, подарок, адрес; «Отменить заказ» виден', async () => {
    const { gateway, page, run } = openOrders('/account/orders?n=1042');
    gateway.answer('GET /store/auth/me', meAnswer);
    gateway.answer('GET /store/orders/1042', { status: 200, body: { success: true, data: ORDER } });
    run();
    await settle();
    expect(gateway.keys().filter((key) => key.includes('/store/orders'))).toEqual(['GET /store/orders/1042']);
    expect([hidden(page, 'list-view'), hidden(page, 'order-view')]).toEqual([true, false]);
    expect([
      text(page, 'order-subtitle'),
      text(page, 'order-meta'),
      text(page, 'order-number'),
      text(page, 'order-status'),
      text(page, 'order-address'),
    ]).toEqual(['Заказ №1042', '2 товара · от 20.10.26', '1042', 'Оплачен', 'Москва, Тверская, д. 7']);
    expect(text(page, 'order-total').replace(/\s/g, '')).toBe('4980₽');
    expect(texts(page, 'title')).toEqual(['Шарф «Нова»', 'Платок']);
    expect(texts(page, 'options')[0]).toBe('Цвет: Красный');
    expect(texts(page, 'quantity')[0]).toBe('2 шт.');
    expect(texts(page, 'total')[1]).toBe('Подарок');
    expect(hidden(page, 'cancel-open')).toBe(false);
  });

  it('отмена: пустая причина — текст без запроса; с причиной — POST cancel и перезагрузка страницы, как у прода', async () => {
    const { gateway, page, run } = openOrders('/account/orders?n=1042');
    gateway.answer('GET /store/auth/me', meAnswer);
    // после отмены часть orders перечитывает заказ — второй ответ
    gateway.answer(
      'GET /store/orders/1042',
      { status: 200, body: { success: true, data: ORDER } },
      { status: 200, body: { success: true, data: { ...ORDER, status: 'cancelled' } } },
    );
    gateway.answer('POST /store/orders/1042/cancel', { status: 200, body: { success: true } });
    run();
    await settle();
    click(page, '[data-action="cancel-confirm"]');
    await settle();
    expect([text(page, 'cancel-error'), gateway.calls.filter((call) => call.key.includes('cancel')).length]).toEqual([
      'Укажите причину отмены',
      0,
    ]);
    type(page, 'reason', 'Передумала');
    click(page, '[data-action="cancel-confirm"]');
    await settle();
    expect(gateway.calls.find((call) => call.key === 'POST /store/orders/1042/cancel')).toEqual({
      key: 'POST /store/orders/1042/cancel',
      body: { reason: 'Передумала' },
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('отмена не удалась — текст ошибки, страница не перезагружается', async () => {
    const { gateway, page, run } = openOrders('/account/orders?n=1042');
    gateway.answer('GET /store/orders/1042', { status: 200, body: { success: true, data: ORDER } });
    gateway.answer('POST /store/orders/1042/cancel', { status: 500, body: { success: false } });
    run();
    await settle();
    type(page, 'reason', 'Передумала');
    click(page, '[data-action="cancel-confirm"]');
    await settle();
    expect([hidden(page, 'cancel-error'), reload.mock.calls.length]).toEqual([false, 0]);
  });

  it('нет заказа — «Заказ не найден»; превью — «У вас пока нет заказов» без запросов', async () => {
    const first = openOrders('/account/orders?n=9');
    first.gateway.answer('GET /store/orders/9', { status: 404, body: { success: false, error: 'Order not found' } });
    first.run();
    await settle();
    expect([text(first.page, 'order-error'), hidden(first.page, 'order-body')]).toEqual([ORDER_MISSING_TEXT, true]);
    core?.stop();
    document.body.replaceChildren();
    const second = openOrders('/account/orders', 'preview');
    second.run();
    await settle();
    expect([second.gateway.calls.length, hidden(second.page, 'loading'), hidden(second.page, 'empty')]).toEqual([
      0,
      true,
      false,
    ]);
  });
});

// «Профиль» в «Шапке» (п. 21; Р10в-14): в HTML — /login, вошедшей скрипт ставит /account.
const HEADER_TEMPLATE = source('../../storefront-sections/fixtures/shop/header/template.astro');

function openHeader() {
  const gateway = fakeGateway();
  document.head.innerHTML = configTag('live');
  const header = placeSection(
    'shop:header',
    'header-1',
    '<a href="/login" data-ref="profile" aria-label="Профиль">Профиль</a>' +
      '<a href="/wishlist">Избранное <span data-ref="favorites-count" hidden>0</span></a>' +
      '<a href="/cart" data-action="cart.open">Корзина <span data-ref="cart-count" hidden>0</span></a>',
  );
  core = start({
    parts: [cart, favorites, customer],
    sections: [entry('shop:header', headerScript, { uses: ['cart', 'favorites', 'customer'] })],
  });
  return { gateway, header };
}

describe('«Шапка»: «Профиль»', () => {
  it('шаблон: у каждой ссылки /login — data-ref="profile"', () => {
    const links = HEADER_TEMPLATE.match(/<a\b[^>]*href="\/login"[^>]*>/g) ?? [];
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((link) => link.includes('data-ref="profile"'))).toBe(true);
  });

  it('вошедшая — /account; гостья — /login', async () => {
    const first = openHeader();
    first.gateway.answer('GET /store/auth/me', meAnswer);
    first.gateway.answer('GET /storefront/wishlist', { status: 200, body: { success: true, data: [] } });
    await settle();
    expect(first.header.querySelector('[data-ref="profile"]')?.getAttribute('href')).toBe('/account');
    core?.stop();
    document.body.replaceChildren();
    localStorage.removeItem(CUSTOMER_TOKEN_KEY);
    const second = openHeader();
    await settle();
    expect(second.header.querySelector('[data-ref="profile"]')?.getAttribute('href')).toBe('/login');
  });
});

describe('места блоков расширений (блок 12, часть 12б)', () => {
  it('кабинет — data-ext-point="account"', () => {
    expect(ACCOUNT_TEMPLATE).toContain('<div data-ext-point="account"></div>');
  });

  it('заказы — место сразу после list-view', () => {
    expect(ORDERS_TEMPLATE).toContain('<div data-ext-point="orders"></div>');
    expect(ORDERS_TEMPLATE.indexOf('data-ext-point="orders"')).toBeGreaterThan(
      ORDERS_TEMPLATE.indexOf('data-ref="list-view"'),
    );
  });

  it('?ext= — список заказов скрыт и не грузится', async () => {
    const { gateway, page, run } = openOrders('/account/orders?ext=test-ext');
    run();
    await settle();
    expect(hidden(page, 'list-view')).toBe(true);
    expect(gateway.keys().filter((key) => key.includes('/store/orders'))).toEqual([]);
  });
});
