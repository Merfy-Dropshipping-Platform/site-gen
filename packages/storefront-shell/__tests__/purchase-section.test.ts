import type { StorefrontConfig } from '@merfy/storefront-config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CUSTOMER_TOKEN_KEY } from '../src/core/customer-token';
import { purchase } from '../src/core/parts/purchase';
import type { CoreHandle, InstanceHost, Mode } from '../src/core/types';

// Кнопка «В корзину» и форма расширения (блок 12 «Секций и SDK», часть 12д, Р12д-8): рантайма theme-base нет, форму
// показывает секция расширения; часть прячет кнопку, если функция формы точки product дала форму. Расширение — test-ext.
const SHOP = '3a9626f7-390d-4a66-bca5-a3b806ca6c1b';
const API = 'https://gateway.dev.merfy.ru/api';
const MAP: NonNullable<StorefrontConfig['extPoints']> = {
  'other-ext': { cart: { note: { text: 'x' } } },
  'test-ext': { product: { form: 'productForm' } },
};
const FORM_URL = `${API}/store/extensions/test-ext/fn/productForm?store_id=${SHOP}`;
const PLACE =
  '<div data-ext-point="product" data-product-id="p-1"><button data-action="cart.add">В корзину</button></div>';

function configOf(mode: Mode, extPoints: StorefrontConfig['extPoints'] = MAP): CoreHandle['config'] {
  return {
    v: 1,
    mode,
    shop: { id: SHOP, name: 'Магазин', url: null },
    currency: 'RUB',
    locale: 'ru-RU',
    api: { url: API },
    theme: { id: 'nova', version: '0.1.0' },
    page: { id: 'product', path: '/product/stol' },
    analytics: null,
    ...(extPoints === undefined ? {} : { extPoints }),
  };
}

const partOf = (): CoreHandle['part'] => () => {
  throw new Error('part не нужен этому тесту');
};

function attach(mode: Mode = 'live', extPoints: StorefrontConfig['extPoints'] = MAP): HTMLElement {
  const element = document.createElement('section');
  element.innerHTML = PLACE;
  document.body.append(element);
  const host: InstanceHost = {
    element,
    name: 'shop:product',
    id: 'product-1',
    mode,
    signal: new AbortController().signal,
  };
  purchase.attach?.(purchase.create({ config: configOf(mode, extPoints), mode, emit: vi.fn(), part: partOf() }), host);
  return element;
}

const answer = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

function stub(form: unknown) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    void init; // requestJson всегда передаёт init; тесту нужны адрес, тело и заголовок
    return Promise.resolve(answer({ success: true, data: form }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// Тело запроса — JSON-строка (requestJson сериализует тело); иначе тесту нечего разбирать.
const bodyText = (init: RequestInit | undefined): string => (typeof init?.body === 'string' ? init.body : '');

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
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe('purchase: кнопка «В корзину» и форма расширения', () => {
  it('форма для товара есть — кнопка спрятана, рантайма theme-base нет; функция формы — с товаром и токеном', async () => {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, 'token-12d');
    const fetchMock = stub({ title: 'Оставить заявку' });
    const element = attach();
    await settle();
    const button = element.querySelector('button');
    expect([button?.hidden, button?.style.display]).toEqual([true, 'none']);
    expect(document.querySelector('script, style, [data-extension-purchase], [data-product-actions]')).toBeNull();
    expect(Reflect.has(window, '__merfyPurchase')).toBe(false);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([FORM_URL]);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(bodyText(init))).toEqual({ productId: 'p-1' });
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer token-12d');
  });

  it.each<[string, unknown, NonNullable<StorefrontConfig['extPoints']>, number]>([
    ['формы для товара нет (null)', null, MAP, 1],
    ['у включённых расширений нет функции формы точки product', { title: 'x' }, { 'other-ext': { cart: { note: { text: 'x' } } } }, 0],
  ])('%s — кнопка на месте', async (_name, form, extPoints, requests) => {
    const fetchMock = stub(form);
    const element = attach('live', extPoints);
    await settle();
    expect(element.querySelector('button')?.hidden).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(requests);
  });

  it('превью конструктора — ни запросов, ни правок разметки', async () => {
    const fetchMock = stub({ title: 'x' });
    const element = attach('preview');
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(element.innerHTML).toBe(PLACE);
  });

  it('сеть упала — кнопка на месте, без console.error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('сеть'))),
    );
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const element = attach();
    await settle();
    expect(element.querySelector('button')?.hidden).toBe(false);
    expect(error).not.toHaveBeenCalled();
  });
});
