import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import addedScript from '../sections/cart-added/script';
import drawerScript from '../sections/cart-drawer/script';
import { CART_ID_KEY, cart } from '../src/core/parts/cart';
import { start, type StartedCore } from '../src/core/start';
import { configTag, entry, placeSection, watchFailures } from './core-support';
import { SHOP_ID, fakeGateway, serverItem } from './sdk-support';

// «Корзина-панель» и окно «Товар добавлен в корзину» (блок 10 «Секций и SDK», 10.2, 10.3, «Решил сам» пп. 6, 8; часть
// 10а): окна открывает поведение dialog по open-on (тест Chromium — accordion-dialog.browser.test.ts), здесь — разметка
// и что заполняют скрипты. «Шапка» и «Значок корзины» — cart.open.
const here = dirname(fileURLToPath(import.meta.url));
const source = (path: string): string => readFileSync(join(here, path), 'utf8');
const DRAWER = source('../sections/cart-drawer/template.astro');
const ADDED = source('../sections/cart-added/template.astro');
const HEADER = source('../../storefront-sections/fixtures/shop/header/template.astro');
const CART = { id: 'c-1', subtotalCents: 498000, discountCents: 0, totalCents: 498000, promoCode: null };
const STORE_UNMOUNT_DELAY = 1000;
let core: StartedCore | undefined;
let failures: ReturnType<typeof watchFailures>;

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await vi.advanceTimersByTimeAsync(0);
};
const shown = (root: Element, ref: string): string[] =>
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

describe('разметка окон корзины', () => {
  it('«Корзина-панель»: drawer справа, open-on cart-open, схема выезжающей корзины, тексты и ссылки как у пяти тем', () => {
    for (const part of [
      'data-transition="drawer"',
      'data-open-on="cart-open"',
      'scheme-cart-drawer',
      'Скрыть',
      'Продолжить покупки',
      'href="/catalog"',
      'Есть аккаунт? Войти',
      'href="/login"',
      'Итого',
      'Налоги, скидки и стоимость доставки рассчитываются при оформлении заказа.',
      'Оформить заказ',
    ])
      expect(DRAWER).toContain(part);
    // Блок 12, часть 12а (п. 16): «Оформить заказ» — ссылка на оформление, работает и при упавшем скрипте панели.
    expect(DRAWER).toMatch(
      /<a\b(?=[^>]*href="\/checkout")(?=[^>]*data-action="cart\.checkout")[^>]*>\s*Оформить заказ/,
    );
  });

  it('«Товар добавлен»: fade, open-on cart-add, «Перейти в корзину», «Купить сейчас» — cart.checkout, «Закрыть» и «Продолжить покупки» закрывают', () => {
    for (const part of [
      'data-transition="fade"',
      'data-open-on="cart-add"',
      'Товар добавлен в корзину',
      'href="/cart"',
      'Перейти в корзину (',
      'data-action="cart.checkout"',
      'Купить сейчас',
    ])
      expect(ADDED).toContain(part);
    expect(ADDED).toMatch(
      /<button[^>]*data-part="close"[^>]*>\s*<svg[^>]*>.*<\/svg>\s*<span class="sr-only">Закрыть<\/span>/s,
    );
    expect(ADDED).toMatch(/<button[^>]*data-part="close"[^>]*>\s*Продолжить покупки/);
  });

  it('«Шапка»: каждая ссылка /cart — cart.open и число; значок корзины — cart.open', () => {
    const links = HEADER.match(/<a\b[^>]*href="\/cart"[^>]*>/g) ?? [];
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((tag) => tag.includes('data-action="cart.open"'))).toBe(true);
    expect(HEADER.match(/data-ref="cart-count"/g)?.length).toBe(links.length);
    expect(source('../sections/cart-badge/template.astro')).toContain('href="/cart" data-action="cart.open"');
  });
});

describe('скрипты окон', () => {
  function openPage() {
    const gateway = fakeGateway();
    document.head.innerHTML = configTag('live');
    const drawer = placeSection('shop:cart-drawer', 'drawer-1', DRAWER);
    const added = placeSection('shop:cart-added', 'added-1', ADDED);
    placeSection(
      'shop:buy',
      'buy-1',
      '<button type="button" data-action="cart.add" data-product-id="p12">В корзину</button>',
    );
    core = start({
      parts: [cart],
      sections: [
        entry('shop:cart-drawer', drawerScript, { uses: ['cart'] }),
        entry('shop:cart-added', addedScript, { uses: ['cart'] }),
      ],
    });
    return { gateway, drawer, added };
  }

  it('«В корзину»: окно — название и цена добавленной строки, число штук; панель — строка и итог', async () => {
    const { gateway, drawer, added } = openPage();
    gateway.answer('POST /store/carts', {
      status: 201,
      body: { cart: { id: 'c-1', shopId: SHOP_ID, status: 'cart' } },
    });
    gateway.answer('POST /store/carts/c-1/items', { status: 201, body: { item: serverItem('l-1', 'p12', 2) } });
    gateway.answer('GET /store/carts/c-1', { status: 200, body: { cart: CART, items: [serverItem('l-1', 'p12', 2)] } });
    await settle();
    document.querySelector<HTMLButtonElement>('[data-action="cart.add"]')?.click();
    await settle();
    expect(shown(added, 'title')).toEqual(['Шарф']);
    expect(shown(added, 'price')[0]?.replace(/\s/g, '')).toBe('2490₽');
    expect(shown(added, 'count')).toEqual(['2']);
    expect(shown(added, 'options')).toEqual([]);
    expect(shown(added, 'compare')).toEqual([]);
    expect(shown(drawer, 'title')).toEqual(['Шарф']);
    expect(shown(drawer, 'total').at(-1)?.replace(/\s/g, '')).toBe('4980₽');
    expect(failures.details).toEqual([]);
  });

  it('«В корзину» вариантного товара: значения варианта через запятую; цена до скидки — когда её вернуло чтение корзины', async () => {
    const { gateway, added } = openPage();
    const item = { ...serverItem('l-1', 'p12', 1, 'v-blue'), options: { Цвет: 'Синий', Размер: 'S' } };
    gateway.answer('POST /store/carts', {
      status: 201,
      body: { cart: { id: 'c-1', shopId: SHOP_ID, status: 'cart' } },
    });
    gateway.answer('POST /store/carts/c-1/items', { status: 201, body: { item } });
    gateway.answer('GET /store/carts/c-1', {
      status: 200,
      body: { cart: CART, items: [{ ...item, compareAtPriceCents: 399000 }] },
    });
    await settle();
    document.querySelector<HTMLButtonElement>('[data-action="cart.add"]')?.click();
    await settle();
    expect(shown(added, 'options')).toEqual(['Синий, S']);
    expect(shown(added, 'compare')[0]?.replace(/\s/g, '')).toBe('3990₽');
    expect(failures.details).toEqual([]);
  });

  it('пустая панель — «Продолжить покупки» и «Есть аккаунт? Войти», без «Итого 0 ₽» и «Оформить заказ»', async () => {
    localStorage.setItem(CART_ID_KEY, 'c-gone');
    const { gateway, drawer } = openPage();
    gateway.answer('GET /store/carts/c-gone', { status: 404, body: { message: 'Cart not found' } });
    await settle();
    expect(drawer.querySelector('[data-ref="empty"]')?.hasAttribute('hidden')).toBe(false);
    expect(shown(drawer, 'title')).toEqual([]);
    expect(drawer.querySelector('[data-ref="summary"]')?.hasAttribute('hidden')).toBe(true);
    expect(shown(drawer, 'total')).toEqual([]);
  });
});
