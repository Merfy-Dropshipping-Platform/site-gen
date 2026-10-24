import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BATCH_MS, createAnalytics, type Analytics } from '../src/core/analytics/analytics';
import { CONSENT_KEY } from '../src/core/analytics/consent';
import { VISIT_KEY } from '../src/core/analytics/identity';
import type { CartChange } from '../src/core/analytics/sdk-events';
import { OWNER_KEY } from '../src/core/analytics/traffic';

// Модуль аналитики целиком в jsdom (design.md блока 11, раздел 5): корзина — вызовы cart() с событиями SDK, уже
// переведёнными (блок 13, sdk-events.ts); настоящие document.cookie, localStorage и sessionStorage; отправка — подмена
// sendBeacon; время поддельное — setInterval и Date. Каждый openPage() — новая загрузка страницы: новый модуль.
// Слушатели модулей прошлых тестов остаются на window, поэтому отправленное каждый модуль записывает в sent своего теста.
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const COLLECTOR = 'https://analytics.dev.merfy.ru';
const NOW = new Date('2026-10-10T08:00:00.000Z');
const TITLE = 'Каталог — Шарфы';
const SCARF: CartChange = { type: 'add_to_cart', product: { id: 'scarf-1', quantity: 1 } };
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
let ids = 0;
let readyState: DocumentReadyState = 'complete';
let visibility: DocumentVisibilityState = 'visible';

function openPage(): Analytics {
  const batches = sent;
  return createAnalytics({
    win: window,
    beacon: (url, body) => {
      const batch: unknown = JSON.parse(body);
      if (isBatch(batch)) batches.push({ url, batch });
      return true;
    },
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
// Микрозадач у модуля больше нет: корзина приходит вызовом cart(), без подписки на стор.

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
  it('превью конструктора и конфиг без analytics: ничего не уходит, меток нет', () => {
    setConfig({ ...CONFIG, mode: 'preview' });
    const preview = openPage();
    preview.page();
    preview.cart(SCARF);
    setConfig({ ...CONFIG, analytics: null });
    const empty = openPage();
    empty.page();
    empty.cart(SCARF);
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

  it('принял посреди визита: тот же номер визита становится посетителем, счётчик грузится сразу', () => {
    const page = openPage();
    page.page();
    localStorage.setItem(CONSENT_KEY, NOW.toISOString());
    page.cart({ type: 'add_to_cart', product: { id: 'scarf-1', quantity: 2 } });
    vi.advanceTimersByTime(BATCH_MS);
    expect(events().map((event) => [event.type, event.session_id, event.visitor_id])).toEqual([
      ['session_start', 'id-1', 'id-1'],
      ['page_view', 'id-1', 'id-1'],
      ['add_to_cart', 'id-1', 'id-1'],
    ]);
    expect([cookies(), metrika()]).toEqual([{ _mfy_vid: 'id-1', _mfy_sid: 'id-1' }, 1]);
  });

  it('отклонил: ничего не уходит — ни событий, ни меток, ни визита, ни счётчиков', () => {
    localStorage.setItem(CONSENT_KEY, `declined:${NOW.toISOString()}`);
    const page = openPage();
    page.page();
    page.cart(SCARF);
    vi.advanceTimersByTime(BATCH_MS);
    expect(sent).toEqual([]);
    expect([cookies(), sessionStorage.getItem(VISIT_KEY), metrika()]).toEqual([{}, null, 0]);
  });

  it('корзина — переведённые события SDK: тип и товар, без цены; до первого просмотра — ничего', () => {
    const page = openPage();
    page.cart(SCARF);
    page.page();
    page.cart({ type: 'add_to_cart', product: { id: 'scarf-1', quantity: 2 } });
    page.cart({ type: 'remove_from_cart', product: { id: 'coat-7', quantity: 1 } });
    vi.advanceTimersByTime(BATCH_MS);
    const lines = events().filter((event) => event.type === 'add_to_cart' || event.type === 'remove_from_cart');
    expect(lines.map((event) => [event.type, event.product_id, 'product_price' in event])).toEqual([
      ['add_to_cart', 'scarf-1', false],
      ['remove_from_cart', 'coat-7', false],
    ]);
  });

  it('ответ сменился на «принял» — счётчик Метрики сразу, без нового события; модуль без просмотра — ничего', () => {
    const idle = openPage();
    const page = openPage();
    page.page();
    expect(metrika()).toBe(0);
    localStorage.setItem(CONSENT_KEY, NOW.toISOString());
    idle.consent();
    expect(metrika()).toBe(0);
    page.consent();
    expect(metrika()).toBe(1);
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
