import type { StorefrontConfig } from '@merfy/storefront-config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOLD_CACHE_KEY } from '../src/core/sold-by-form';
import { purchase } from '../src/core/parts/purchase';
import type { CoreHandle, InstanceHost, Mode } from '../src/core/types';

// «В корзину» на карточках у товара, который продаётся формой расширения (блок 15, часть 15г; extension-sale.ts пяти
// тем на dev): attach части purchase прячет кнопки cart.add без места, клик по непроверенному товару ждёт ответа до 3 с.
const SHOP = '3a9626f7-390d-4a66-bca5-a3b806ca6c1b';
const API = 'https://gateway.dev.merfy.ru/api';
const MAP: NonNullable<StorefrontConfig['extPoints']> = { 'test-ext': { product: { form: 'productForm' } } };
const CARDS = `<ul>
  <li><button data-action="cart.add" data-product-id="p-sold" id="sold">В корзину</button></li>
  <li><button data-action="cart.add" data-product-id="p-plain" id="plain">В корзину</button></li>
</ul>`;

function coreOf(mode: Mode = 'live'): CoreHandle {
  return {
    config: {
      v: 1,
      mode,
      shop: { id: SHOP, name: 'Магазин', url: null },
      currency: 'RUB',
      locale: 'ru-RU',
      api: { url: API },
      theme: { id: 'nova', version: '0.1.0' },
      page: { id: 'catalog', path: '/catalog' },
      analytics: null,
      extPoints: MAP,
    },
    mode,
    emit: vi.fn(),
    part: () => {
      throw new Error('part не нужен этому тесту');
    },
  };
}

const answer = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const bodyText = (init: RequestInit | undefined): string => (typeof init?.body === 'string' ? init.body : '');

// Форма у p-sold (место product — в конфиге страницы); корзина — POST /store/carts и /items отвечают пустой корзиной.
function stub(delayMs = 0) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/fn/productForm')) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return answer({ success: true, data: bodyText(init).includes('p-sold') ? { title: 'Заявка' } : null });
    }
    return answer({ success: true, data: { id: 'cart-1', items: [] } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function mount(mode: Mode = 'live'): HTMLElement {
  const core = coreOf(mode);
  const api = purchase.create(core);
  const element = document.createElement('merfy-section');
  element.innerHTML = CARDS;
  document.body.append(element);
  const host: InstanceHost = { element, name: 'shop:catalog', id: 'catalog-1', mode, signal: new AbortController().signal };
  purchase.attach?.(api, host);
  return element;
}

const hiddenOf = (id: string): boolean => document.getElementById(id)?.hidden === true;

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('purchase: кнопки cart.add карточек у товара с формой', () => {
  it('attach: кнопка товара с формой спрятана, обычного — на месте', async () => {
    stub();
    mount();
    await settle();
    expect([hiddenOf('sold'), hiddenOf('plain')]).toEqual([true, false]);
    expect(document.getElementById('sold')?.style.display).toBe('none');
  });

  it('известный ответ (кэш вкладки) — кнопка спрятана сразу, до запросов', () => {
    sessionStorage.setItem(SOLD_CACHE_KEY, JSON.stringify({ storeId: SHOP, at: Date.now(), ids: { 'p-sold': true } }));
    stub();
    mount();
    expect(hiddenOf('sold')).toBe(true);
  });

  it('клик по непроверенному товару с формой: поглощён, кнопка прячется', async () => {
    stub(50);
    mount();
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.getElementById('sold')?.dispatchEvent(click);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(click.defaultPrevented).toBe(true);
    expect(hiddenOf('sold')).toBe(true);
  });

  it('клик по обычному товару: после ответа клик проходит свободно, кнопка на месте', async () => {
    stub();
    mount();
    await settle(); // ответ известен: p-plain — обычный
    const first = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.getElementById('plain')?.dispatchEvent(first);
    await settle();
    expect(first.defaultPrevented).toBe(false);
    expect(hiddenOf('plain')).toBe(false);
  });

  it('расширение молчит дольше 3 с — товар считается обычным, повторный клик проходит свободно', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    stub(10_000);
    mount();
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.getElementById('sold')?.dispatchEvent(click);
    await vi.advanceTimersByTimeAsync(3_100);
    expect(click.defaultPrevented).toBe(true);
    expect(hiddenOf('sold')).toBe(false);
    const second = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.getElementById('sold')?.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
  });

  it('превью — ни запросов функции формы, ни правок кнопок', async () => {
    const fetchMock = stub();
    mount('preview');
    await settle();
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('/store/extensions/'))).toEqual([]);
    expect([hiddenOf('sold'), hiddenOf('plain')]).toEqual([false, false]);
  });
});
