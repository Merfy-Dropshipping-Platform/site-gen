import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import headerScript from '../../storefront-sections/fixtures/shop/header/script';
import wishlistScript from '../sections/wishlist/script';
import { auth } from '../src/core/parts/auth';
import { cart } from '../src/core/parts/cart';
import { FAVORITES_KEY, favorites } from '../src/core/parts/favorites';
import { start, type StartedCore } from '../src/core/start';
import { configTag, entry, placeSection, watchFailures } from './core-support';
import { fakeGateway } from './sdk-support';

// Секция «Избранное» и число в «Шапке» (блок 10 «Секций и SDK», 10.6, «Решил сам» пп. 14, 15, 21; часть 10б,
// Р10б-12, Р10б-13): карточки — script.ts по <template> из ctx.favorites.$products; «Убрать» — favorites.toggle.
const here = dirname(fileURLToPath(import.meta.url));
const source = (path: string): string => readFileSync(join(here, path), 'utf8');
const WISHLIST = source('../sections/wishlist/template.astro');
const HEADER = source('../../storefront-sections/fixtures/shop/header/template.astro');
const NOW = 1_800_000_000_000;
const STORE_UNMOUNT_DELAY = 1000;
const NOVA = {
  id: 'c2d3547d-65fd-4581-85ba-f2cff15dc477',
  title: 'Шарф «Нова»',
  handle: 'nova',
  basePrice: 2490,
  compareAtPrice: 2990,
  images: ['https://minio.dev.merfy.ru/scarves/nova.jpg'],
  quantity: 5,
  hasVariants: false,
};
let core: StartedCore | undefined;
let failures: ReturnType<typeof watchFailures>;

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await vi.advanceTimersByTimeAsync(0);
};
const shown = (root: Element, ref: string): string[] =>
  [...root.querySelectorAll(`[data-ref="${ref}"]`)].filter((el) => !el.closest('[hidden]')).map((el) => el.textContent?.trim() ?? '');
const guestList = (...ids: string[]): void =>
  localStorage.setItem(FAVORITES_KEY, JSON.stringify({ ids: ids.map((productId, i) => ({ productId, addedAt: NOW - i })) }));

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

function openWishlist() {
  const gateway = fakeGateway();
  document.head.innerHTML = configTag('live');
  const page = placeSection('shop:wishlist', 'wishlist-1', WISHLIST);
  core = start({ parts: [favorites], sections: [entry('shop:wishlist', wishlistScript, { uses: ['favorites'] })] });
  return { gateway, page };
}

describe('«Избранное»', () => {
  it('шаблон: пусто — текст и «Перейти в каталог»; карточка в <template>; «Убрать» — favorites.toggle', () => {
    for (const part of ['В избранном пока ничего нет', 'Перейти в каталог', 'href="/catalog"', '<template>', 'data-action="favorites.toggle"'])
      expect(WISHLIST).toContain(part);
  });

  it('пусто — текст виден, карточек нет, запросов к товарам нет', async () => {
    const { gateway, page } = openWishlist();
    await settle();
    expect(page.querySelector('[data-ref="empty"]')?.hasAttribute('hidden')).toBe(false);
    expect(shown(page, 'title')).toEqual([]);
    expect(gateway.calls).toEqual([]);
  });

  it('карточка: название, цена и старая цена, ссылка на товар; «Убрать» — карточка уходит, текст пустого виден', async () => {
    guestList(NOVA.id);
    const { gateway, page } = openWishlist();
    gateway.answer('GET /store/products', { status: 200, body: { products: [NOVA] } });
    await settle();
    expect(shown(page, 'title')).toEqual(['Шарф «Нова»']);
    expect(shown(page, 'price')[0]?.replace(/\s/g, '')).toBe('2490₽');
    expect(shown(page, 'old-price')[0]?.replace(/\s/g, '')).toBe('2990₽');
    expect(page.querySelector('[data-ref="link"]')?.getAttribute('href')).toBe('/product/nova');
    const remove = page.querySelector<HTMLButtonElement>('[data-ref="remove"]');
    expect(remove?.getAttribute('data-product-id')).toBe(NOVA.id);
    remove?.click();
    await settle();
    expect(shown(page, 'title')).toEqual([]);
    expect(page.querySelector('[data-ref="empty"]')?.hasAttribute('hidden')).toBe(false);
    expect(failures.details).toEqual([]);
  });
});

describe('«Шапка»: избранное', () => {
  it('шаблон: «Избранное» — при wishlist-enabled, число favorites-count у каждой ссылки /wishlist', () => {
    const links = HEADER.match(/<a\b[^>]*href="\/wishlist"[^>]*>/g) ?? [];
    expect(links.length).toBeGreaterThan(0);
    expect(HEADER.match(/data-ref="favorites-count"/g)?.length).toBe(links.length);
    expect(HEADER).toContain("theme['wishlist-enabled'] !== false");
  });

  it('число отмеченных — в шапке; 0 — скрыто', async () => {
    guestList('p1', 'p2');
    fakeGateway();
    document.head.innerHTML = configTag('live');
    const header = placeSection(
      'shop:header',
      'header-1',
      '<a href="/wishlist">Избранное <span data-ref="favorites-count" hidden>0</span></a>' +
        '<a href="/cart" data-action="cart.open">Корзина <span data-ref="cart-count" hidden>0</span></a>',
    );
    core = start({ parts: [cart, favorites, auth], sections: [entry('shop:header', headerScript, { uses: ['cart', 'favorites', 'auth'] })] });
    await settle();
    expect(shown(header, 'favorites-count')).toEqual(['2']);
    expect(header.querySelector('[data-ref="cart-count"]')?.hasAttribute('hidden')).toBe(true);
  });
});
