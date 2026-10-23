import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cartFeed, createAnalyticsPart } from '../src/core/analytics/part';
import { cart } from '../src/core/parts/cart';
import { start, type StartedCore } from '../src/core/start';
import { atom, readable } from '../src/core/stores';
import type { CartLine, CartState, Mode } from '../src/core/types';
import { tick } from './core-support';

// Часть SDK «аналитика» в ядре секций (блок 5 «Секций и SDK», часть 5б, раздел 3.13): просмотр — по merfy:page:view
// ядра, пачка — по pagehide; корзина — только прочитанные состояния $cart. Модуль аналитики целиком проверяют
// analytics-*.test.ts, здесь — только связь с ядром. У каждой страницы свой список отправленного: слушатели страниц
// прошлых тестов остаются на document и window.
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const COLLECTOR = 'https://analytics.dev.merfy.ru';
const ANALYTICS = { url: COLLECTOR, counters: [] };

interface Sent {
  url: string;
  types: string[];
}

let core: StartedCore | undefined;

function setConfig(mode: Mode): void {
  const config = {
    v: 1,
    mode,
    shop: { id: SHOP, name: 'Шарфы', url: 'https://scarves.example' },
    currency: 'RUB',
    locale: 'ru-RU',
    api: { url: 'https://gateway.dev.merfy.ru/api' },
    theme: { id: 'nova', version: '0.1.0' },
    page: { id: 'catalog', path: '/catalog' },
    analytics: mode === 'live' ? ANALYTICS : null,
  };
  document.head.innerHTML = `<script type="application/json" id="merfy-config">${JSON.stringify(config)}</script>`;
}

const typesOf = (body: string): string[] => {
  const batch: unknown = JSON.parse(body);
  const events: unknown = typeof batch === 'object' && batch !== null ? Reflect.get(batch, 'events') : [];
  return Array.isArray(events) ? events.map((event: unknown) => String(Reflect.get(Object(event), 'type'))) : [];
};

// Страница с ядром: части по списку и аналитика со своим списком отправленного.
async function openPage(withCart = true): Promise<Sent[]> {
  const sent: Sent[] = [];
  let ids = 0;
  const analytics = createAnalyticsPart({
    window,
    beacon: (url, body) => sent.push({ url, types: typesOf(body) }) > 0,
    newId: () => `id-${(ids += 1)}`,
  });
  core = start({ parts: withCart ? [cart, analytics] : [analytics], sections: [] }, { window });
  await tick();
  return sent;
}

const line = (productId: string, quantity: number): CartLine => ({
  id: `l-${productId}`,
  productId,
  variantId: null,
  quantity,
  price: { amount: 249000, currency: 'RUB' },
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  // Сети в тесте нет: номера корзины нет, корзина ядра запросов не шлёт; запрос всё же ушёл — он падает здесь.
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  core?.stop();
  core = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe('часть «аналитика»', () => {
  it('витрина: просмотр по merfy:page:view после запуска; pagehide — пачка в сборщик сразу', async () => {
    setConfig('live');
    const sent = await openPage();
    expect(sent).toEqual([]);
    window.dispatchEvent(new Event('pagehide'));
    expect(sent).toEqual([{ url: `${COLLECTOR}/collect`, types: ['session_start', 'page_view'] }]);
  });

  it('превью: ничего не уходит', async () => {
    setConfig('preview');
    const sent = await openPage();
    window.dispatchEvent(new Event('pagehide'));
    expect(sent).toEqual([]);
  });

  it('части cart на странице нет — просмотр уходит, в консоли строка про корзину', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setConfig('live');
    const sent = await openPage(false);
    window.dispatchEvent(new Event('pagehide'));
    // Визит уже начат страницей первого теста (её слушатели остались) — здесь только просмотр.
    expect(sent.flatMap((item) => item.types)).toContain('page_view');
    expect(consoleError.mock.calls.map(([text]) => String(text))).toEqual(['Аналитика: нет корзины ядра']);
  });
});

describe('корзина ядра для аналитики', () => {
  it('только прочитанные состояния: заготовка до чтения и повторное чтение не доходят', () => {
    const $cart = atom<CartState>({ ready: false, lines: [] });
    const seen: number[] = [];
    cartFeed(readable($cart)).subscribe((state) => seen.push(state.lines.length));
    $cart.set({ ready: true, lines: [] });
    $cart.set({ ready: true, lines: [line('scarf-1', 2)] });
    $cart.set({ ready: false, lines: [] });
    expect(seen).toEqual([0, 1]);
  });

  it('уже прочитанная корзина — сразу текущее состояние; отписка — больше ничего', () => {
    const $cart = atom<CartState>({ ready: true, lines: [line('coat-7', 1)] });
    const seen: number[] = [];
    const stop = cartFeed(readable($cart)).subscribe((state) => seen.push(state.lines.length));
    stop();
    $cart.set({ ready: true, lines: [] });
    expect(seen).toEqual([1]);
  });

  it('стор не из ядра (без подписки) — ошибка', () => {
    const foreign = { get: (): CartState => ({ ready: true, lines: [] }) };
    expect(() => cartFeed(foreign).subscribe(() => undefined)).toThrow('у корзины ядра нет подписки');
  });
});
