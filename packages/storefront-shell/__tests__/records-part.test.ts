import { EXT_POINT_CLASSES } from '@merfy/shell/ext-points';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CUSTOMER_TOKEN_KEY } from '../src/core/customer-token';
import { records } from '../src/core/parts/records';
import type { CoreHandle, InstanceHost, Mode } from '../src/core/types';

// «Мои заказы»: записи расширений в месте data-ext-point="orders" (блок 12 «Секций и SDK», часть 12е, Р12е-3…Р12е-5) —
// свой код ядра, рантайма theme-base нет; поведение и тексты — extension-orders theme-base. Расширение — test-ext.
const SHOP = '3a9626f7-390d-4a66-bca5-a3b806ca6c1b';
const API = 'https://gateway.dev.merfy.ru/api';
const MAP_URL = `${API}/store/extensions/storefront?store_id=${SHOP}`;
const LIST_URL = `${API}/store/extensions/test-ext/fn/mineList?store_id=${SHOP}`;
const GET_URL = `${API}/store/extensions/test-ext/fn/mineGet?store_id=${SHOP}`;
const MAP = {
  'other-ext': { cart: { note: { text: 'x' } } },
  'test-ext': { orders: { list: 'mineList', get: 'mineGet' } },
};
const NOW = new Date('2026-10-26T12:00:00.000Z');
const ITEMS = [
  { id: 'r-1', number: '№1', title: 'Стол', status: 'Новая', tone: 'info', date: '2025-10-02T12:00:00.000Z' },
  {
    id: 'r-2',
    number: '№2',
    title: '<img src=x>',
    status: 'Готово',
    tone: 'success',
    date: '2026-10-26T11:00:00.000Z',
  },
  { id: 'r-3', number: '№3', title: 'Без даты', status: 'Новая', date: 'вчера' },
];
const ENTRY = {
  number: '№2',
  title: 'Табурет',
  status: 'Готово',
  tone: 'success',
  date: '2026-10-26T11:00:00.000Z',
  blocks: [
    { type: 'text', text: 'Первая строка\nвторая\n\nНовый абзац' },
    { type: 'pairs', rows: [{ label: 'Длина', value: '180 см' }] },
    { type: 'lines', rows: [{ label: 'Работа', value: '3 000 ₽' }], total: { label: 'Итого', value: '3 000 ₽' } },
    { type: 'button', label: 'Написать', url: '/contacts' },
    { type: 'button', label: 'Чужой', url: 'javascript:alert(1)' },
    { type: 'video', url: 'https://merfy.ru/v.mp4' },
  ],
};
type Routes = Readonly<Record<string, () => Response>>;

function configOf(mode: Mode): CoreHandle['config'] {
  return {
    v: 1,
    mode,
    shop: { id: SHOP, name: 'Магазин', url: null },
    currency: 'RUB',
    locale: 'ru-RU',
    api: { url: API },
    theme: { id: 'nova', version: '0.1.0' },
    page: { id: 'page-orders', path: '/account/orders' },
    analytics: null,
  };
}

const partOf = (): CoreHandle['part'] => () => {
  throw new Error('part не нужен этому тесту');
};

function attach(mode: Mode = 'live'): HTMLElement {
  const element = document.createElement('section');
  element.innerHTML = '<div data-ext-point="orders"></div>';
  document.body.append(element);
  const host: InstanceHost = {
    element,
    name: 'shop:orders',
    id: 'orders-1',
    mode,
    signal: new AbortController().signal,
  };
  records.attach?.(records.create({ config: configOf(mode), mode, emit: vi.fn(), part: partOf() }), host);
  const place = element.querySelector<HTMLElement>('[data-ext-point="orders"]');
  if (place === null) throw new Error('нет места orders');
  return place;
}

const answer = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ok = (data: unknown) => (): Response => answer(200, { success: true, data });
const failed = (): Response => answer(500, { success: false });

function stub(routes: Routes) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    void init; // requestJson всегда передаёт init; тесту нужен только адрес
    const route = routes[url];
    return route === undefined ? Promise.reject(new Error(`нет ответа: ${url}`)) : Promise.resolve(route());
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// Тело запроса — JSON-строка (requestJson сериализует тело); иначе тесту нечего разбирать.
const bodyText = (init: RequestInit | undefined): string => (typeof init?.body === 'string' ? init.body : '');

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

const classesIn = (root: Element): string[] =>
  [...root.querySelectorAll('[class]')].flatMap((node) => [...node.classList]);
const hrefsIn = (root: Element): (string | null)[] =>
  [...root.querySelectorAll('a')].map((a) => a.getAttribute('href'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  history.replaceState(null, '', '/account/orders');
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe('records: список записей', () => {
  it('строки — новые сверху, неполная пропущена; ссылка, дата, статус и тон; токен; классы словаря; theme-base нет', async () => {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, 'token-12e');
    const fetchMock = stub({ [MAP_URL]: ok(MAP), [LIST_URL]: ok({ items: ITEMS }) });
    const place = attach();
    await settle();
    expect(hrefsIn(place)).toEqual(['/account/orders?ext=test-ext&id=r-2', '/account/orders?ext=test-ext&id=r-1']);
    const [first, second] = [...place.querySelectorAll('a')];
    expect(first?.textContent).toContain('№2 · <img src=x>');
    expect(first?.textContent).toContain('сегодня, ');
    expect(second?.textContent).toContain('2 октября 2025');
    expect(place.querySelector('img')).toBeNull();
    expect(place.querySelector('[data-tone="success"]')?.textContent).toBe('Готово');
    for (const name of classesIn(place)) expect(EXT_POINT_CLASSES.records).toContain(name);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([MAP_URL, LIST_URL]);
    const init = fetchMock.mock.calls[1]?.[1];
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer token-12e');
    expect(JSON.parse(bodyText(init))).toEqual({});
    expect(document.querySelector('script, style')).toBeNull();
    expect(Reflect.has(window, '__merfyExtensionOrders')).toBe(false);
  });

  it('функция списка упала — строк нет, без console.error; превью — ни запросов, ни строк', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    stub({ [MAP_URL]: ok(MAP), [LIST_URL]: failed });
    const place = attach();
    await settle();
    expect(place.childElementCount).toBe(0);
    expect(error).not.toHaveBeenCalled();
    const fetchMock = stub({ [MAP_URL]: ok(MAP) });
    const preview = attach('preview');
    await settle();
    expect([fetchMock.mock.calls.length, preview.childElementCount]).toEqual([0, 0]);
  });
});

describe('records: страница записи (?ext=&id=)', () => {
  it('блоки: абзацы и строки текста, пары, строки с итогом, только безопасная кнопка; неизвестный блок пропущен', async () => {
    history.replaceState(null, '', '/account/orders?ext=test-ext&id=r-2');
    const fetchMock = stub({ [MAP_URL]: ok(MAP), [GET_URL]: ok(ENTRY) });
    const place = attach();
    await settle();
    expect(hrefsIn(place)).toEqual(['/account/orders', '/contacts']);
    expect(place.querySelector('a')?.textContent).toBe('← Мои заказы');
    const texts = [...place.querySelectorAll('p')].map((p) => p.textContent);
    expect(texts).toEqual(expect.arrayContaining(['№2', 'Первая строкавторая', 'Новый абзац']));
    const first = [...place.querySelectorAll('p')].find((p) => p.textContent === 'Первая строкавторая');
    expect(first?.querySelectorAll('span')).toHaveLength(2);
    for (const text of ['Табурет · сегодня, ', 'Длина', '180 см', 'Итого', 'Готово'])
      expect(place.textContent).toContain(text);
    expect(place.textContent).not.toContain('Чужой');
    for (const name of classesIn(place)) expect(EXT_POINT_CLASSES.records).toContain(name);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(GET_URL);
    expect(JSON.parse(bodyText(fetchMock.mock.calls[1]?.[1]))).toEqual({ id: 'r-2' });
  });

  it.each<[string, string, Routes, string]>([
    ['data: null', '?ext=test-ext&id=r-9', { [MAP_URL]: ok(MAP), [GET_URL]: ok(null) }, 'Запись не найдена'],
    ['расширения нет в карте', '?ext=gone-ext&id=r-1', { [MAP_URL]: ok(MAP) }, 'Запись не найдена'],
    [
      'ответ не той формы',
      '?ext=test-ext&id=r-2',
      { [MAP_URL]: ok(MAP), [GET_URL]: ok({ number: '№2' }) },
      'Не удалось загрузить. Обновите страницу.',
    ],
    [
      'функция упала',
      '?ext=test-ext&id=r-2',
      { [MAP_URL]: ok(MAP), [GET_URL]: failed },
      'Не удалось загрузить. Обновите страницу.',
    ],
  ])('%s — «← Мои заказы» и текст', async (_name, search, routes, text) => {
    history.replaceState(null, '', `/account/orders${search}`);
    stub(routes);
    const place = attach();
    await settle();
    expect(place.querySelector('a')?.textContent).toBe('← Мои заказы');
    expect(place.textContent).toContain(text);
  });
});
