import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorefrontConfig } from '@merfy/storefront-config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { points } from '../src/core/parts/points';
import { records } from '../src/core/parts/records';
import { soldByFormOf } from '../src/core/sold-by-form';
import type { CoreHandle, InstanceHost } from '../src/core/types';

// Места блоков расширений из конфига страницы (блок 15 «Секций и SDK», часть 15д, Р15д-1): описания мест вписывает
// сборка — части points, records и модуль sold-by-form не запрашивают карту расширений у шлюза. Расширение — test-ext.
const SHOP = '3a9626f7-390d-4a66-bca5-a3b806ca6c1b';
const API = 'https://gateway.dev.merfy.ru/api';
const EXT_POINTS: NonNullable<StorefrontConfig['extPoints']> = {
  'test-ext': {
    cart: { note: { text: 'Отзывов к товарам: {reviews}', when: 'reviews' } },
    orders: { list: 'mineList', get: 'mineGet' },
    product: { form: 'productForm' },
  },
};

function coreOf(extPoints?: StorefrontConfig['extPoints']): CoreHandle {
  return {
    config: {
      v: 1,
      mode: 'live',
      shop: { id: SHOP, name: 'Магазин', url: null },
      currency: 'RUB',
      locale: 'ru-RU',
      api: { url: API },
      theme: { id: 'nova', version: '0.1.0' },
      page: { id: 'home', path: '/' },
      analytics: null,
      ...(extPoints === undefined ? {} : { extPoints }),
    },
    mode: 'live',
    emit: vi.fn(),
    part: () => {
      throw new Error('part не нужен этому тесту');
    },
  };
}

function hostOf(html: string): InstanceHost {
  const element = document.createElement('section');
  element.innerHTML = html;
  document.body.append(element);
  return { element, name: 'shop:test', id: 'test-1', mode: 'live', signal: new AbortController().signal };
}

const answer = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

// Ответы шлюза: корзина с view test-ext, пустой список записей, форма — у p-sold.
function stub() {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/store/carts/'))
      return Promise.resolve(answer({ success: true, data: { extensions: { 'test-ext': { view: { reviews: 3 } } } } }));
    if (url.includes('/fn/mineList')) return Promise.resolve(answer({ success: true, data: { items: [] } }));
    const body = typeof init?.body === 'string' ? init.body : '';
    return Promise.resolve(answer({ success: true, data: body.includes('p-sold') ? { title: 'Заявка' } : null }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const urlsOf = (fetchMock: ReturnType<typeof stub>): string[] => fetchMock.mock.calls.map(([url]) => url);

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

// Исходники ядра — все .ts под src/.
function sourcesOf(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourcesOf(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  localStorage.setItem('merfy:cart-id:v1', 'cart-1');
  history.replaceState(null, '', '/account/orders');
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('места расширений из конфига страницы', () => {
  it('points: заметка корзины по config.extPoints, запрос — только корзина', async () => {
    const fetchMock = stub();
    const host = hostOf('<div data-ext-point="cart"></div>');
    points.attach?.(points.create(coreOf(EXT_POINTS)), host);
    await settle();
    expect(host.element.querySelector('[data-ext-id="test-ext"]')?.textContent).toBe('Отзывов к товарам: 3');
    expect(urlsOf(fetchMock)).toEqual([`${API}/store/carts/cart-1?store_id=${SHOP}`]);
  });

  it('points: мест в конфиге нет — ни блоков, ни запросов', async () => {
    const fetchMock = stub();
    const host = hostOf('<div data-ext-point="cart"></div><div data-ext-point="account"></div>');
    points.attach?.(points.create(coreOf()), host);
    await settle();
    expect(host.element.querySelector('[data-ext-id]')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records: функция списка по config.extPoints; мест нет — запросов нет', async () => {
    const fetchMock = stub();
    records.attach?.(records.create(coreOf(EXT_POINTS)), hostOf('<div data-ext-point="orders"></div>'));
    await settle();
    expect(urlsOf(fetchMock)).toEqual([`${API}/store/extensions/test-ext/fn/mineList?store_id=${SHOP}`]);
    fetchMock.mockClear();
    records.attach?.(records.create(coreOf()), hostOf('<div data-ext-point="orders"></div>'));
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sold-by-form: функция формы по config.extPoints; мест нет — «нет» без запросов', async () => {
    const fetchMock = stub();
    const sold = soldByFormOf(coreOf(EXT_POINTS));
    expect([await sold.check('p-sold'), await sold.check('p-plain')]).toEqual([true, false]);
    const form = `${API}/store/extensions/test-ext/fn/productForm?store_id=${SHOP}`;
    expect(urlsOf(fetchMock)).toEqual([form, form]);
    fetchMock.mockClear();
    sessionStorage.clear();
    expect(await soldByFormOf(coreOf()).check('p-other')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('в коде ядра нет адреса карты расширений шлюза — ни в коде, ни в комментариях', () => {
    const files = sourcesOf(join(dirname(fileURLToPath(import.meta.url)), '../src'));
    expect(files.filter((file) => readFileSync(file, 'utf8').includes('extensions/storefront'))).toEqual([]);
  });
});
