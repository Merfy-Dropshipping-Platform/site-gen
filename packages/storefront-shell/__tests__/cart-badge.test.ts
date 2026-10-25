import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import badge from '../sections/cart-badge/script';
import { cart } from '../src/core/parts/cart';
import { start, type StartedCore } from '../src/core/start';
import { configTag, entry, placeSection, watchFailures } from './core-support';
import { SHOP_ID, fakeGateway, serverItem } from './sdk-support';

// «Значок корзины» (блок 9 «Секций и SDK», 9.5; часть 9б): число штук — ctx.watch(ctx.cart.$count); при 0 числа не видно.
// Разметка — template.astro секции как есть; «В корзину» — действие SDK в разметке соседней секции.
const TEMPLATE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../sections/cart-badge/template.astro'),
  'utf8',
);
const BUY = '<button type="button" data-action="cart.add" data-product-id="p12">В корзину</button>';
const STORE_UNMOUNT_DELAY = 1000;
let core: StartedCore | undefined;
let failures: ReturnType<typeof watchFailures>;

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await vi.advanceTimersByTimeAsync(0);
};

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

function openPage() {
  document.head.innerHTML = configTag('live');
  const element = placeSection('shop:cart-badge', 'cart-badge-1', TEMPLATE);
  placeSection('shop:buy', 'buy-1', BUY);
  core = start({ parts: [cart], sections: [entry('shop:cart-badge', badge, { uses: ['cart'] })] });
  const count = element.querySelector('[data-ref="count"]');
  if (count === null) throw new Error('в шаблоне значка нет data-ref="count"');
  return count;
}

describe('«Значок корзины»', () => {
  it('в разметке число скрыто до запуска скрипта', () => {
    expect(TEMPLATE).toContain('<span data-ref="count" hidden>0</span>');
  });

  it('корзины нет — числа не видно', async () => {
    fakeGateway();
    const count = openPage();
    await settle();
    expect([count.textContent, count.hasAttribute('hidden')]).toEqual(['0', true]);
  });

  it('«В корзину» — число 1 видно', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/carts', {
      status: 201,
      body: { cart: { id: 'c-1', shopId: SHOP_ID, status: 'cart' } },
    });
    gateway.answer('POST /store/carts/c-1/items', { status: 201, body: { item: serverItem('l-1', 'p12', 1) } });
    const count = openPage();
    document.querySelector<HTMLButtonElement>('[data-action="cart.add"]')?.click();
    await settle();
    expect([count.textContent, count.hasAttribute('hidden')]).toEqual(['1', false]);
    expect(failures.details).toEqual([]);
  });

  it('добавление не удалось — число вернулось к 0 и снова не видно', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/carts', 'network');
    const count = openPage();
    document.querySelector<HTMLButtonElement>('[data-action="cart.add"]')?.click();
    await settle();
    expect([count.textContent, count.hasAttribute('hidden')]).toEqual(['0', true]);
  });
});
