import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import checkoutScript from '../sections/checkout/script';
import resultScript from '../sections/checkout-result/script';
import { LAST_ORDER_KEY } from '../src/core/checkout-order';
import { navigation } from '../src/core/navigation';
import { CART_ID_KEY, cart } from '../src/core/parts/cart';
import { checkout } from '../src/core/parts/checkout';
import { customer } from '../src/core/parts/customer';
import { start, type StartedCore } from '../src/core/start';
import { configTag, entry, inputTag, placeSection, watchFailures } from './core-support';
import { SHOP_ID, fakeGateway, serverItem } from './sdk-support';

// Секции оформления (базовые секции, 03.11): «Оформление заказа» рисует сторы ctx.checkout — способы оплаты из
// включённых у магазина (полей карты нет), способы доставки, ошибки полей; «Спасибо за заказ» — сводку $order.
// Разметка «Оформления» — template.astro как есть: выражения Astro остаются текстом, data-ref и data-action — те же.
const here = dirname(fileURLToPath(import.meta.url));
const CHECKOUT_TEMPLATE = readFileSync(join(here, '../sections/checkout/template.astro'), 'utf8');
const RESULT_TEMPLATE = readFileSync(join(here, '../sections/checkout-result/template.astro'), 'utf8');
const CART = {
  id: 'c-1',
  shopId: SHOP_ID,
  status: 'cart',
  subtotalCents: 498000,
  discountCents: 0,
  totalCents: 498000,
};
const STORE_UNMOUNT_DELAY = 1000;
let core: StartedCore | undefined;
let failures: ReturnType<typeof watchFailures>;

const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await vi.advanceTimersByTimeAsync(0);
};
const shown = (root: Element, ref: string): string[] =>
  [...root.querySelectorAll(`[data-ref="${ref}"]`)]
    .filter((el) => !el.closest('[hidden]') && !el.closest('template'))
    .map((el) => el.textContent?.trim() ?? '');

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  failures = watchFailures();
  vi.spyOn(navigation, 'go').mockImplementation(() => undefined);
});

afterEach(async () => {
  core?.stop();
  core = undefined;
  await vi.advanceTimersByTimeAsync(STORE_UNMOUNT_DELAY * 2);
  failures.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

function openCheckout() {
  const gateway = fakeGateway();
  localStorage.setItem(CART_ID_KEY, 'c-1');
  gateway.answer('GET /store/carts/c-1', { status: 200, body: { cart: CART, items: [serverItem('l-1', 'p12', 2)] } });
  gateway.answer('POST /store/carts/c-1/delivery/calculate', {
    status: 200,
    body: { success: true, data: { deliveryOptions: [], pickupPoints: [{ id: 's-1', address: 'ул. Ленина, 1' }] } },
  });
  gateway.answer(`GET /billing/shops/${SHOP_ID}/payment-config/public`, {
    status: 200,
    body: { data: { enabledMethods: ['sbp', 'sberbank'] } },
  });
  document.head.innerHTML = configTag('live');
  const section = placeSection('shop:checkout', 'checkout-1', CHECKOUT_TEMPLATE);
  core = start({
    parts: [cart, customer, checkout],
    sections: [entry('shop:checkout', checkoutScript, { uses: ['checkout', 'customer'] })],
  });
  return { gateway, section };
}

describe('«Оформление заказа»', () => {
  it('шаблон: форма с «Оплатить», выборы — действия SDK, полей карты нет', () => {
    for (const part of [
      'data-action="submit:pay"',
      'data-action="checkout.selectDelivery"',
      'data-action="checkout.selectPayment"',
      'data-action="checkout.removePromo"',
      'data-action="pointerdown:checkout.pickHint"',
    ])
      expect(CHECKOUT_TEMPLATE).toContain(part);
    expect(CHECKOUT_TEMPLATE).not.toMatch(/cc-number|cardNumber|cc-exp|cc-csc/);
  });

  it('способы оплаты — только включённые у магазина; выбор — aria-checked; доставка и строки — из модуля', async () => {
    const { section } = openCheckout();
    await settle();
    expect(shown(section, 'method-title')).toEqual(['СБП (Система быстрых платежей)', 'Sber Pay']);
    expect(shown(section, 'option-title')).toEqual(['Самовывоз']);
    expect(shown(section, 'title')).toEqual(['Шарф']);
    const checked = (ref: string): string[] =>
      [...section.querySelectorAll(`[data-ref="${ref}"]`)].map((button) => button.getAttribute('aria-checked') ?? '');
    expect(checked('method')).toEqual(['true', 'false']);
    section.querySelector<HTMLElement>('[data-method="sberbank"]')?.click();
    await settle();
    expect(checked('method')).toEqual(['false', 'true']);
    section.querySelector<HTMLElement>('[data-ref="option"]')?.click();
    await settle();
    expect(checked('option')).toEqual(['true']);
    expect(failures.details).toEqual([]);
  });

  it('«Оплатить» с пустой формой — ошибки под полями, фокус на e-mail, заказа нет', async () => {
    const { section, gateway } = openCheckout();
    await settle();
    section.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(shown(section, 'error-email')).toEqual(['Введите e-mail']);
    expect(shown(section, 'error-firstName')).toEqual(['Введите имя']);
    expect(document.activeElement?.getAttribute('name')).toBe('email');
    expect(gateway.keys().some((key) => key.endsWith('/checkout'))).toBe(false);
  });
});

const RESULT_SETTINGS = {
  heading: 'Спасибо за заказ, {name}!',
  subheading: 'Ваш заказ подтверждён',
  text: 'Скоро придёт письмо.',
  'legal-text': 'Размещая заказ, вы соглашаетесь с Условиями обслуживания и Политикой конфиденциальности.',
};
const LEGAL = `<p data-ref="legal" data-tos="/legal/tos" data-privacy="/legal/privacy"><span data-ref="legal-static"></span><template><span><a data-ref="legal-link"></a><span data-ref="legal-part"></span></span></template></p>`;

function openResult(summary: unknown) {
  const gateway = fakeGateway();
  localStorage.setItem(LAST_ORDER_KEY, 'o-7');
  gateway.answer('GET /orders/o-7/summary', { status: 200, body: summary });
  document.head.innerHTML = configTag('live');
  const head = `<div data-ref="missing" hidden></div><div data-ref="content"><p data-ref="number"></p><h1 data-ref="greeting"></h1><p data-ref="confirmed-title"></p><span data-ref="delivery"></span><span data-ref="total"></span>${LEGAL}</div>`;
  const section = placeSection(
    'shop:checkout-result',
    'result-1',
    `${head}${inputTag({ settings: RESULT_SETTINGS, blocks: [], data: {} })}`,
  );
  core = start({
    parts: [cart, checkout],
    sections: [entry('shop:checkout-result', resultScript, { uses: ['checkout'] })],
  });
  return section;
}

describe('«Спасибо за заказ»', () => {
  it('шаблон: «Ваш заказ», кнопка возврата и юридическая строка со ссылками на политики', () => {
    for (const part of ['Ваш заказ', "settings['button-label']", 'data-ref="legal"', 'data-ref="legal-link"'])
      expect(RESULT_TEMPLATE).toContain(part);
  });

  it('заказ оплачен — номер, приветствие по имени, способ доставки, итог; документы — ссылками', async () => {
    const section = openResult({
      success: true,
      data: {
        orderNumber: '1042',
        customerName: 'Анна Иванова',
        paymentStatus: 'succeeded',
        deliveryMode: 'self_pickup',
        totalCents: 498000,
      },
    });
    await settle();
    expect(shown(section, 'number')).toEqual(['Заказ #1042']);
    expect(shown(section, 'greeting')).toEqual(['Спасибо за заказ, Анна!']);
    expect(shown(section, 'confirmed-title')).toEqual(['Ваш заказ подтверждён']);
    expect(shown(section, 'delivery')).toEqual(['Самовывоз']);
    expect(shown(section, 'total')[0]?.replace(/\s/g, '')).toBe('4980₽');
    const links = [...section.querySelectorAll('a[data-ref="legal-link"]')].filter((link) => !link.closest('template'));
    expect(
      links.filter((link) => !link.hasAttribute('hidden')).map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Условиями обслуживания', '/legal/tos'],
      ['Политикой конфиденциальности', '/legal/privacy'],
    ]);
  });

  it('оплата не прошла — заголовок пяти тем вместо «подтверждён»', async () => {
    const section = openResult({
      success: true,
      data: { orderNumber: '1043', paymentStatus: 'failed', totalCents: 1000 },
    });
    await settle();
    expect(shown(section, 'confirmed-title')).toEqual(['Оплата не прошла']);
    expect(shown(section, 'greeting')).toEqual(['Спасибо за заказ!']);
  });
});
