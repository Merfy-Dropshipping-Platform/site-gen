import { EXT_POINT_CLASSES } from '@merfy/shell/ext-points';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { points } from '../src/core/parts/points';
import type { CoreHandle, InstanceHost, Mode } from '../src/core/types';

// Блоки расширений в местах data-ext-point (блок 12 «Секций и SDK», часть 12б, В12-2 А). Расширение — test-ext.
const SHOP = '3a9626f7-390d-4a66-bca5-a3b806ca6c1b';
const API = 'https://gateway.dev.merfy.ru/api';
const DESCRIPTIONS = {
  'test-ext': { cart: { note: { from: 'view', text: 'Отзывов к товарам: {reviews}', when: 'reviews' } } },
};

// Конфиг страницы целиком (тип строгий), часть читает из него только api.url и shop.id.
function configOf(): CoreHandle['config'] {
  return {
    v: 1,
    mode: 'live',
    shop: { id: SHOP, name: 'Магазин', url: null },
    currency: 'RUB',
    locale: 'ru-RU',
    api: { url: API },
    theme: { id: 'nova', version: '0.1.0' },
    page: { id: 'home', path: '/' },
    analytics: null,
  };
}

// part тесту не нужен: вызов — ошибка.
const partOf = (): CoreHandle['part'] => () => {
  throw new Error('part не нужен этому тесту');
};

function coreOf(mode: Mode = 'live'): CoreHandle {
  return {
    config: configOf(),
    mode,
    emit: vi.fn(),
    part: partOf(),
  };
}

function hostOf(html: string, mode: Mode = 'live'): InstanceHost {
  const element = document.createElement('section');
  element.innerHTML = html;
  document.body.append(element);
  return { element, name: 'merfy:cart', id: 'cart-1', mode, signal: new AbortController().signal };
}

function answer(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  localStorage.setItem('merfy:cart-id:v1', 'cart-1');
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function stubFetch(view: Record<string, unknown>) {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      url.includes('/store/extensions/storefront')
        ? answer({ success: true, data: DESCRIPTIONS })
        : answer({ success: true, data: { extensions: { 'test-ext': { view } } } }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('points: место cart', () => {
  it('заметка корзины: подстановка из view, классы только из словаря части, текст — textContent', async () => {
    const fetchMock = stubFetch({ reviews: 3 });
    const host = hostOf('<div data-ext-point="cart"></div>');
    points.attach?.(points.create(coreOf()), host);
    await flush();
    await flush();

    const block = host.element.querySelector('[data-ext-id="test-ext"]');
    expect(block?.textContent).toBe('Отзывов к товарам: 3');
    const used = [...host.element.querySelectorAll('[class]')].flatMap((node) => [...node.classList]);
    for (const name of used) expect(EXT_POINT_CLASSES.points).toContain(name);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${API}/store/extensions/storefront?store_id=${SHOP}`,
      `${API}/store/carts/cart-1?store_id=${SHOP}`,
    ]);
  });

  it('заметка корзины: when ложно — блока нет', async () => {
    stubFetch({ reviews: 0 });
    const host = hostOf('<div data-ext-point="cart"></div>');
    points.attach?.(points.create(coreOf()), host);
    await flush();
    await flush();
    expect(host.element.querySelector('[data-ext-id]')).toBeNull();
  });

  it('превью — ни запросов, ни блоков', async () => {
    const fetchMock = stubFetch({ reviews: 3 });
    const host = hostOf('<div data-ext-point="cart"></div>', 'preview');
    points.attach?.(points.create(coreOf('preview')), host);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.element.querySelector('[data-ext-point]')?.childElementCount).toBe(0);
  });

  it('запрос упал — место пустое, без console.error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('сеть'))),
    );
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const host = hostOf('<div data-ext-point="cart"></div>');
    points.attach?.(points.create(coreOf()), host);
    await flush();
    await flush();
    expect(host.element.querySelector('[data-ext-point]')?.childElementCount).toBe(0);
    expect(error).not.toHaveBeenCalled();
  });
});

// purchase — __tests__/purchase-section.test.ts (блок 12, часть 12д, Р12д-8): рантайма theme-base в части нет.
