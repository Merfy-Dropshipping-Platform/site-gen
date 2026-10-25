import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cartScript from '../sections/cart/script';
import summaryScript from '../sections/cart-summary/script';
import { CART_ID_KEY, cart } from '../src/core/parts/cart';
import { start, type StartedCore } from '../src/core/start';
import { configTag, entry, placeSection, watchFailures } from './core-support';
import { fakeGateway, serverItem } from './sdk-support';

// Секции страницы корзины (блок 10 «Секций и SDK», 10.4, «Решил сам» п. 7; часть 10а, Р10а-11): строки — script.ts
// через El.list по <template>; «−», «+», «Удалить» — действия SDK в разметке; итоги — ctx.cart.$totals. Разметка
// «Корзины» — template.astro как есть; «Промежуточного итога» — то, что шаблон выводит при двух блоках по умолчанию.
const here = dirname(fileURLToPath(import.meta.url));
const CART_TEMPLATE = readFileSync(join(here, '../sections/cart/template.astro'), 'utf8');
const SUMMARY_SOURCE = readFileSync(join(here, '../sections/cart-summary/template.astro'), 'utf8');
const SUMMARY = `<div>
  <p>Сумма <span data-ref="subtotal"></span></p>
  <p data-ref="discount" hidden><span data-ref="discount-name">Скидка</span> <span data-ref="discount-value"></span></p>
  <p>Итого <span data-ref="total"></span></p>
  <a href="/checkout" data-action="cart.checkout" data-ref="checkout">Оформить заказ</a>
</div>`;
const CART = { id: 'c-1', subtotalCents: 747000, discountCents: 74700, totalCents: 672300, promoCode: 'AUTO:Осень' };
const STORE_UNMOUNT_DELAY = 1000;
let core: StartedCore | undefined;
let failures: ReturnType<typeof watchFailures>;

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await vi.advanceTimersByTimeAsync(0);
};
const text = (root: Element, ref: string): string[] =>
  [...root.querySelectorAll(`[data-ref="${ref}"]`)]
    .filter((el) => !el.closest('[hidden]'))
    .map((el) => el.textContent?.trim() ?? '');

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  failures = watchFailures();
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

// Отклонение от плана (правило 24.10, типы теста карточки): строки теста расширяют serverItem новыми name и
// options — параметр аннотирован явно, значения и ожидания не менялись.
function openPage(...items: unknown[]) {
  const gateway = fakeGateway();
  if (items.length > 0) {
    localStorage.setItem(CART_ID_KEY, 'c-1');
    gateway.answer('GET /store/carts/c-1', { status: 200, body: { cart: CART, items } });
  }
  document.head.innerHTML = configTag('live');
  const lines = placeSection('shop:cart', 'cart-1', CART_TEMPLATE);
  const summary = placeSection('shop:cart-summary', 'summary-1', SUMMARY);
  core = start({
    parts: [cart],
    sections: [
      entry('shop:cart', cartScript, { uses: ['cart'] }),
      entry('shop:cart-summary', summaryScript, { uses: ['cart'] }),
    ],
  });
  return { gateway, lines, summary };
}

describe('«Корзина»', () => {
  it('шаблон: пустая корзина, строка в <template>, действия «−», «+», «Удалить»', () => {
    for (const part of [
      'В корзине пока пусто',
      'href="/catalog"',
      '<template>',
      'data-action="cart.change"',
      'data-action="cart.remove"',
    ])
      expect(CART_TEMPLATE).toContain(part);
  });

  it('пустая — «В корзине пока пусто», строк нет', async () => {
    const { lines } = openPage();
    await settle();
    expect(lines.querySelector('[data-ref="empty"]')?.hasAttribute('hidden')).toBe(false);
    expect(text(lines, 'title')).toEqual([]);
  });

  it('строки: название, варианты, цена, количество, сумма; подарок — без «−», «+», «Удалить»', async () => {
    const red = { ...serverItem('l-2', 'p7', 1, 'v-red'), name: 'Шарф «Нова»', options: { Цвет: 'Красный' } };
    const gift = { ...serverItem('l-3', 'p12', 1), name: 'Платок', unitPriceCents: 0, totalCents: 0, isBonus: true };
    const { lines } = openPage(serverItem('l-1', 'p12', 2), red, gift);
    await settle();
    expect(lines.querySelector('[data-ref="empty"]')?.hasAttribute('hidden')).toBe(true);
    expect(text(lines, 'title')).toEqual(['Шарф', 'Шарф «Нова»', 'Платок']);
    expect(text(lines, 'options')).toContain('Цвет: Красный');
    expect(text(lines, 'quantity')).toEqual(['2', '1', '1']);
    expect(text(lines, 'total')[0]?.replace(/\s/g, '')).toBe('4980₽');
    expect(text(lines, 'remove')).toHaveLength(2);
    const more = lines.querySelector('[data-ref="more"]');
    expect([more?.getAttribute('data-line-id'), more?.getAttribute('data-quantity')]).toEqual(['l-1', '3']);
  });

  it('«+» — cart.change с количеством + 1; «Удалить» — cart.remove', async () => {
    const { gateway, lines } = openPage(serverItem('l-1', 'p12', 2));
    await settle();
    gateway.answer('PATCH /store/carts/c-1/items/l-1', { status: 200, body: {} });
    gateway.answer('GET /store/carts/c-1', { status: 200, body: { cart: CART, items: [serverItem('l-1', 'p12', 3)] } });
    lines.querySelector<HTMLButtonElement>('[data-ref="more"]')?.click();
    await settle();
    expect(text(lines, 'quantity')).toEqual(['3']);
    gateway.answer('DELETE /store/carts/c-1/items/l-1', { status: 200, body: { success: true } });
    gateway.answer('GET /store/carts/c-1', {
      status: 200,
      body: { cart: { ...CART, subtotalCents: 0, discountCents: 0, totalCents: 0 }, items: [] },
    });
    lines.querySelector<HTMLButtonElement>('[data-ref="remove"]')?.click();
    await settle();
    expect(gateway.keys().slice(-2)).toEqual(['DELETE /store/carts/c-1/items/l-1', 'GET /store/carts/c-1']);
    expect(lines.querySelector('[data-ref="empty"]')?.hasAttribute('hidden')).toBe(false);
    expect(failures.details).toEqual([]);
  });
});

describe('«Промежуточный итог»', () => {
  it('шаблон: блоки total и button, текст о налогах, «Оформить заказ» — cart.checkout', () => {
    expect(SUMMARY_SOURCE).toContain('Налоги, скидки и стоимость доставки рассчитываются при оформлении заказа.');
    expect(SUMMARY_SOURCE).toContain('data-action="cart.checkout"');
    for (const ref of ['subtotal', 'discount', 'total', 'checkout'])
      expect(SUMMARY_SOURCE).toContain(`data-ref="${ref}"`);
  });

  it('сумма, скидка с именем, итог — из $totals', async () => {
    const { summary } = openPage(serverItem('l-1', 'p12', 3));
    await settle();
    const money = (ref: string) => text(summary, ref)[0]?.replace(/\s/g, '');
    expect([money('subtotal'), money('discount-value'), money('total')]).toEqual(['7470₽', '−747₽', '6723₽']);
    expect(text(summary, 'discount-name')).toEqual(['Скидка «Осень»']);
  });

  it('пустая корзина — кнопки нет, скидки нет', async () => {
    const { summary } = openPage();
    await settle();
    expect(summary.querySelector('[data-ref="checkout"]')?.hasAttribute('hidden')).toBe(true);
    expect(summary.querySelector('[data-ref="discount"]')?.hasAttribute('hidden')).toBe(true);
  });
});

describe('место блоков расширений (блок 12, часть 12б)', () => {
  it('место блоков расширений — data-ext-point="cart" (блок 12, часть 12б)', () => {
    expect(CART_TEMPLATE).toContain('<div data-ext-point="cart"></div>');
  });
});
