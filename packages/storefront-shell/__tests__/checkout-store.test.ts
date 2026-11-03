import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAST_ORDER_KEY } from '../src/core/checkout-order';
import { PENDING_ORDER_KEY } from '../src/core/cart-checkout';
import { navigation } from '../src/core/navigation';
import { CART_ID_KEY, cart } from '../src/core/parts/cart';
import { checkout } from '../src/core/parts/checkout';
import { watchSource } from '../src/core/stores';
import type { CheckoutModule, CoreHandle, Mode, ModuleName, Modules, ReadableStore } from '../src/core/types';
import { SHOP_ID, fakeCore, fakeGateway, field, serverItem, settle } from './sdk-support';

// ctx.checkout (базовые секции, 03.11): форма, способы доставки и оплаты, промокод и «Оплатить» — цепочка пяти тем
// внутри модуля. Оплата — способом из включённых у магазина, без полей карты: create-payment получает paymentMethod и
// отдаёт адрес платёжки, туда и уходит покупатель.
const CART = {
  id: 'c-1',
  shopId: SHOP_ID,
  status: 'cart',
  subtotalCents: 498000,
  discountCents: 0,
  totalCents: 498000,
};
const cartReply = { status: 200, body: { cart: CART, items: [serverItem('l-1', 'p12', 2)] } };
const SETTINGS = `GET /public/sites/${SHOP_ID}/settings`;
const PAYMENT = `GET /billing/shops/${SHOP_ID}/payment-config/public`;
const CALC = 'POST /store/carts/c-1/delivery/calculate';
const pickup = {
  success: true,
  data: { deliveryOptions: [], pickupPoints: [{ id: 's-1', address: 'ул. Ленина, 1', city: 'Москва' }] },
};

const stops: Array<() => void> = [];
const went: string[] = [];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(navigation, 'go').mockImplementation((path) => void went.push(path));
});

afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  went.splice(0);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Ядро части в тесте: корзина — настоящая часть cart, подписки — через фасады сторов, как у ядра.
function openCheckout(mode: Mode = 'live') {
  const base = fakeCore(mode);
  const cartModule = cart.create(base.core);
  const parts: Partial<Modules> = { cart: cartModule };
  const core: CoreHandle = {
    ...base.core,
    part: <N extends ModuleName>(name: N): Modules[N] => {
      const found = parts[name];
      if (found === undefined) throw new Error(`части ${name} в тесте нет`);
      return found;
    },
    watch: (store, listener) => watchSource(store)?.listen(listener) ?? (() => undefined),
  };
  const module = checkout.create(core);
  return { module, events: base.named };
}

// Подписка секции: она запускает чтения модуля.
function read<T>(store: ReadableStore<T>): void {
  const stop = watchSource(store)?.listen(() => undefined);
  if (stop !== undefined) stops.push(stop);
}

function mountForm(module: CheckoutModule): void {
  read(module.$settings);
  read(module.$form);
  read(module.$delivery);
  read(module.$payment);
  read(module.$lines);
  read(module.$totals);
}

function fill(module: CheckoutModule): void {
  module.set({ field: 'email', value: 'anna@example.ru' });
  module.set({ field: 'firstName', value: 'Анна' });
  module.set({ field: 'lastName', value: 'Иванова' });
}

describe('настройки и способы оплаты', () => {
  it('телефон — только при обязательном входе; способы — включённые у магазина, выбран первый', async () => {
    const gateway = fakeGateway();
    gateway.answer(SETTINGS, {
      status: 200,
      body: { settings: { requireCustomerAuth: false, customerNameMode: 'name' } },
    });
    gateway.answer(PAYMENT, { status: 200, body: { data: { enabledMethods: ['sbp', 'sberbank'] } } });
    const { module } = openCheckout();
    mountForm(module);
    await settle();
    expect(module.$settings.get()).toMatchObject({ ready: true, phone: false, name: 'name', signIn: false });
    expect(module.$payment.get().methods.map((method) => method.key)).toEqual(['sbp', 'sberbank']);
    expect(module.$payment.get().selected).toBe('sbp');
    expect(module.selectPayment({ method: 'bank_card' }).ok).toBe(false);
    expect(module.selectPayment({ method: 'sberbank' }).ok).toBe(true);
    expect(module.$payment.get().selected).toBe('sberbank');
  });

  it('гость магазина с обязательным входом уходит на «Вход»', async () => {
    const gateway = fakeGateway();
    gateway.answer(SETTINGS, { status: 200, body: { settings: { requireCustomerAuth: true } } });
    const { module } = openCheckout();
    read(module.$settings);
    await settle();
    expect(module.$settings.get().phone).toBe(true);
    expect(went).toEqual(['/login?redirect=%2Fcheckout']);
  });
});

describe('ошибки формы', () => {
  it('ошибка поля видна после ухода с поля; «Оплатить» с ошибками — invalid, видны все, запросов заказа нет', async () => {
    localStorage.setItem(CART_ID_KEY, 'c-1');
    const gateway = fakeGateway();
    gateway.answer('GET /store/carts/c-1', cartReply);
    gateway.answer(CALC, { status: 200, body: pickup });
    const { module } = openCheckout();
    mountForm(module);
    await settle();
    module.set({ field: 'email', value: 'anna' });
    expect(module.$form.get().errors).toEqual({});
    module.leave({ field: 'email' });
    expect(module.$form.get().errors.email).toBe('Проверьте e-mail: в нём нужны @ и точка');
    const result = await module.submit();
    expect(result.ok ? null : result.error.code).toBe('invalid');
    expect(module.$form.get().errors).toMatchObject({ firstName: 'Введите имя', delivery: 'Выберите способ доставки' });
    expect(gateway.keys().some((key) => key.includes('/checkout'))).toBe(false);
  });
});

describe('«Оплатить»', () => {
  it('самовывоз и СБП: покупатель, заказ, платёж выбранным способом — переход на платёжку; второго заказа нет', async () => {
    localStorage.setItem(CART_ID_KEY, 'c-1');
    const gateway = fakeGateway();
    gateway.answer('GET /store/carts/c-1', cartReply, cartReply);
    gateway.answer(CALC, { status: 200, body: pickup });
    gateway.answer(PAYMENT, { status: 200, body: { data: { enabledMethods: ['bank_card', 'sbp'] } } });
    gateway.answer('PATCH /orders/cart/c-1/customer', { status: 200, body: { success: true } });
    gateway.answer('PATCH /orders/cart/c-1/address', { status: 200, body: { success: true } });
    gateway.answer('POST /orders/cart/c-1/checkout', {
      status: 201,
      body: { success: true, data: { orderId: 'o-7' } },
    });
    gateway.answer('POST /orders/o-7/create-payment', {
      status: 201,
      body: {
        success: true,
        data: { confirmationUrl: 'https://yoomoney.ru/checkout/payments/v2/contract?orderId=pay-1' },
      },
    });
    const { module, events } = openCheckout();
    mountForm(module);
    await settle();
    fill(module);
    const option = module.$delivery.get().options[0];
    expect(option?.title).toBe('Самовывоз');
    expect(module.selectDelivery({ id: option?.id ?? '' }).ok).toBe(true);
    expect(module.selectPayment({ method: 'sbp' }).ok).toBe(true);
    const first = module.submit();
    const second = await module.submit();
    expect(second.ok).toBe(false);
    const result = await first;
    expect(result).toEqual({ ok: true, data: { orderId: 'o-7' } });
    expect(gateway.keys().filter((key) => key.endsWith('/checkout'))).toEqual(['POST /orders/cart/c-1/checkout']);
    const order = gateway.calls.find((call) => call.key === 'POST /orders/cart/c-1/checkout');
    expect(field(field(order?.body, 'metadata'), 'paymentMethod')).toBe('sbp');
    expect(field(field(field(order?.body, 'metadata'), 'deliveryMethod'), 'type')).toBe('self_pickup');
    const payment = gateway.calls.find((call) => call.key === 'POST /orders/o-7/create-payment');
    expect(field(payment?.body, 'paymentMethod')).toBe('sbp');
    expect(String(field(payment?.body, 'returnUrl'))).toMatch(/\/checkout-result\?orderId=o-7$/);
    expect(went).toEqual(['https://yoomoney.ru/checkout/payments/v2/contract?orderId=pay-1']);
    expect(localStorage.getItem(LAST_ORDER_KEY)).toBe('o-7');
    expect(localStorage.getItem(PENDING_ORDER_KEY)).toContain('o-7');
    expect(localStorage.getItem(CART_ID_KEY)).toBeNull();
    expect(events('merfy:checkout:order')).toEqual([
      { orderId: 'o-7', total: { amount: 498000, currency: 'RUB' }, method: 'sbp' },
    ]);
  });

  it('отказ платежа — текст под кнопкой, кнопка снова доступна', async () => {
    localStorage.setItem(CART_ID_KEY, 'c-1');
    const gateway = fakeGateway();
    gateway.answer('GET /store/carts/c-1', cartReply);
    gateway.answer(CALC, { status: 200, body: pickup });
    gateway.answer('POST /orders/cart/c-1/checkout', {
      status: 201,
      body: { success: true, data: { orderId: 'o-8' } },
    });
    gateway.answer('POST /orders/o-8/create-payment', {
      status: 400,
      body: { message: 'Платёжная система не настроена' },
    });
    const { module } = openCheckout();
    mountForm(module);
    await settle();
    fill(module);
    module.selectDelivery({ id: module.$delivery.get().options[0]?.id ?? '' });
    const result = await module.submit();
    expect(result.ok ? null : result.error.message).toBe('Платёжная система не настроена');
    expect(module.$status.get()).toMatchObject({ submitting: false, error: 'Платёжная система не настроена' });
    expect(went).toEqual([]);
  });

  it('превью заказ не оформляет', async () => {
    fakeGateway();
    const { module } = openCheckout('preview');
    const result = await module.submit();
    expect(result.ok).toBe(false);
  });
});

describe('промокод', () => {
  it('отказ — текст магазина в $promo.error; успех — код применён и сохранён до оплаты', async () => {
    localStorage.setItem(CART_ID_KEY, 'c-1');
    const gateway = fakeGateway();
    gateway.answer('GET /store/carts/c-1', cartReply, cartReply);
    gateway.answer(
      'POST /orders/cart/c-1/promo',
      { status: 400, body: { message: 'Промокод не найден' } },
      { status: 200, body: { success: true } },
    );
    const { module } = openCheckout();
    read(module.$promo);
    read(module.$totals);
    await settle();
    const refused = await module.applyPromo({ code: 'НЕТ' });
    expect(refused.ok).toBe(false);
    expect(module.$promo.get()).toEqual({ code: null, busy: false, error: 'Промокод не найден' });
    const applied = await module.applyPromo({ code: ' ОСЕНЬ ' });
    expect(applied.ok).toBe(true);
    expect(module.$promo.get().code).toBe('ОСЕНЬ');
    expect(sessionStorage.getItem('merfy:promoCode')).toBe('ОСЕНЬ');
  });
});
