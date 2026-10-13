import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCart } from '../src/parts/cart';
import type { CartPart } from '../src/parts/types';
import { BATCH_MS, createAnalytics, type Analytics } from '../sections/analytics/analytics';
import { CONSENT_KEY } from '../sections/analytics/consent';
import { VISIT_KEY } from '../sections/analytics/identity';
import { OWNER_KEY } from '../sections/analytics/traffic';

// Модуль аналитики целиком в jsdom (design.md блока 11, раздел 5): настоящая корзина ядра (блок 7), настоящие
// document.cookie, localStorage и sessionStorage; отправка — подмена sendBeacon; время поддельное — только setInterval и
// Date, микрозадачи корзины настоящие. Каждый openPage() — новая загрузка страницы: новый модуль. Слушатели модулей
// прошлых тестов остаются на window, поэтому отправленное каждый модуль кладёт в sent своего теста.
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const COLLECTOR = 'https://analytics.dev.merfy.ru';
const NOW = new Date('2026-10-10T08:00:00.000Z');
const TITLE = 'Каталог — Шарфы';
const CONFIG = {
  v: 1,
  mode: 'live',
  shop: { id: SHOP, name: 'Шарфы', url: 'https://scarves.example' },
  currency: 'RUB',
  locale: 'ru-RU',
  api: { url: 'https://gateway.dev.merfy.ru/api' },
  theme: { id: 'nova', version: '0.1.0' },
  page: { id: 'catalog', path: '/catalog' },
  analytics: { url: COLLECTOR, counters: [{ kind: 'metrika', number: '12345678' }] },
};

interface Batch {
  shop_id: string;
  events: Record<string, string>[];
}

const isBatch = (value: unknown): value is Batch =>
  typeof value === 'object' && value !== null && Array.isArray(Reflect.get(value, 'events'));

let sent: { url: string; batch: Batch }[] = [];
let cart: CartPart = createCart();
let ids = 0;
let readyState: DocumentReadyState = 'complete';
let visibility: DocumentVisibilityState = 'visible';

function openPage(): Analytics {
  const batches = sent;
  const pageCart = cart;
  return createAnalytics({
    win: window,
    beacon: (url, body) => {
      const batch: unknown = JSON.parse(body);
      if (isBatch(batch)) batches.push({ url, batch });
      return true;
    },
    cart: () => Promise.resolve(pageCart),
    newId: () => `id-${(ids += 1)}`,
  });
}

function setConfig(config: object): void {
  const tag = document.createElement('script');
  tag.type = 'application/json';
  tag.id = 'merfy-config';
  tag.textContent = JSON.stringify(config);
  document.head.replaceChildren(tag);
  document.title = TITLE;
}

const events = (): Record<string, string>[] => sent.flatMap((item) => item.batch.events);
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function cookies(): Record<string, string> {
  const pairs = document.cookie.split('; ').filter((pair) => pair !== '');
  return Object.fromEntries(
    pairs.map((pair): [string, string] => {
      const [name = '', value = ''] = pair.split('=');
      return [name, value];
    }),
  );
}

// Вставленный код счётчика Метрики с номером из конфига.
const metrika = (): number =>
  [...document.head.querySelectorAll('script:not([src])')].filter(
    (script) => script.textContent?.includes('ym(12345678,') === true,
  ).length;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'], now: NOW });
  sent = [];
  cart = createCart();
  ids = 0;
  readyState = 'complete';
  visibility = 'visible';
  Object.defineProperty(document, 'readyState', { configurable: true, get: () => readyState });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  localStorage.clear();
  sessionStorage.clear();
  Object.keys(cookies()).forEach((name) => {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
  });
  setConfig(CONFIG);
  history.replaceState(null, '', '/catalog?utm_source=vk');
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'readyState');
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('модуль аналитики на странице', () => {
  it('превью конструктора и конфиг без analytics: ничего не уходит, меток нет', async () => {
    setConfig({ ...CONFIG, mode: 'preview' });
    openPage().page();
    setConfig({ ...CONFIG, analytics: null });
    openPage().page();
    await settle();
    cart.add('scarf-1');
    await settle();
    vi.advanceTimersByTime(BATCH_MS);
    expect(sent).toEqual([]);
    expect([cookies(), sessionStorage.getItem(VISIT_KEY)]).toEqual([{}, null]);
  });

  it('до ответа на баннер: визит и просмотр раз в 5 с; номер визита — и посетитель; cookie и счётчиков нет', () => {
    openPage().page();
    vi.advanceTimersByTime(BATCH_MS);
    const view = {
      session_id: 'id-1',
      visitor_id: 'id-1',
      page_url: '/catalog',
      page_title: TITLE,
      referrer: '',
      timestamp: NOW.toISOString(),
      utm_source: 'vk',
    };
    expect(sent.map((item) => [item.url, item.batch.shop_id])).toEqual([[`${COLLECTOR}/collect`, SHOP]]);
    expect(events()).toEqual([
      { type: 'session_start', ...view },
      { type: 'page_view', ...view },
    ]);
    expect([cookies(), metrika()]).toEqual([{}, 0]);
    openPage().page();
    vi.advanceTimersByTime(BATCH_MS);
    expect(events().map((event) => [event.type, event.session_id])).toEqual([
      ['session_start', 'id-1'],
      ['page_view', 'id-1'],
      ['page_view', 'id-1'],
    ]);
  });

  it('принял: метки _mfy_vid и _mfy_sid; счётчик Метрики — после загрузки страницы и один раз', () => {
    localStorage.setItem(CONSENT_KEY, NOW.toISOString());
    readyState = 'loading';
    const page = openPage();
    page.page();
    expect(metrika()).toBe(0);
    readyState = 'complete';
    window.dispatchEvent(new Event('load'));
    page.page();
    expect(metrika()).toBe(1);
    expect(cookies()).toEqual({ _mfy_vid: 'id-1', _mfy_sid: 'id-1' });
  });

  it('принял посреди визита: тот же номер визита становится посетителем, счётчик грузится сразу', async () => {
    openPage().page();
    await settle();
    localStorage.setItem(CONSENT_KEY, NOW.toISOString());
    cart.add('scarf-1', 2);
    await settle();
    vi.advanceTimersByTime(BATCH_MS);
    expect(events().map((event) => [event.type, event.session_id, event.visitor_id])).toEqual([
      ['session_start', 'id-1', 'id-1'],
      ['page_view', 'id-1', 'id-1'],
      ['add_to_cart', 'id-1', 'id-1'],
    ]);
    expect([cookies(), metrika()]).toEqual([{ _mfy_vid: 'id-1', _mfy_sid: 'id-1' }, 1]);
  });

  it('отклонил: ничего не уходит — ни событий, ни меток, ни визита, ни счётчиков', async () => {
    localStorage.setItem(CONSENT_KEY, `declined:${NOW.toISOString()}`);
    openPage().page();
    await settle();
    cart.add('scarf-1');
    await settle();
    vi.advanceTimersByTime(BATCH_MS);
    expect(sent).toEqual([]);
    expect([cookies(), sessionStorage.getItem(VISIT_KEY), metrika()]).toEqual([{}, null, 0]);
  });

  it('корзина: начальное состояние — не событие; «в корзину» и «из корзины» по разнице, без цены', async () => {
    cart.add('coat-7');
    await settle();
    openPage().page();
    await settle();
    cart.add('scarf-1', 2);
    cart.add('scarf-1');
    cart.remove('coat-7');
    await settle();
    vi.advanceTimersByTime(BATCH_MS);
    const lines = events().filter((event) => event.type === 'add_to_cart' || event.type === 'remove_from_cart');
    expect(lines.map((event) => [event.type, event.product_id, 'product_price' in event])).toEqual([
      ['add_to_cart', 'scarf-1', false],
      ['add_to_cart', 'scarf-1', false],
      ['remove_from_cart', 'coat-7', false],
    ]);
  });

  it('?mfy_owner=1: параметр убран из адреса, события помечены internal, метки рекламы на месте', () => {
    history.replaceState(null, '', '/catalog?mfy_owner=1&utm_source=vk');
    openPage().page();
    vi.advanceTimersByTime(BATCH_MS);
    expect(`${location.pathname}${location.search}`).toBe('/catalog?utm_source=vk');
    expect(events().map((event) => [event.type, event.traffic, event.utm_source])).toEqual([
      ['session_start', 'internal', 'vk'],
      ['page_view', 'internal', 'vk'],
    ]);
    expect(localStorage.getItem(OWNER_KEY)).toBe('1');
  });

  it('страница ушла в фон — пачка уходит сразу; снятие секции (unmount) — тоже', () => {
    const page = openPage();
    page.page();
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(events().map((event) => event.type)).toEqual(['session_start', 'page_view']);
    visibility = 'visible';
    page.page();
    page.flush();
    expect(events().map((event) => event.type)).toEqual(['session_start', 'page_view', 'page_view']);
  });
});
