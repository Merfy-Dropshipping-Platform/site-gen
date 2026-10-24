import { COUNTER_KINDS as CONFIG_KINDS, COUNTER_NUMBERS as CONFIG_NUMBERS } from '@merfy/storefront-config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CART_EVENTS, cartChangeOf, type CartChange } from '../src/core/analytics/sdk-events';
import { BATCH_MAX, collectorDestination, collectorEvent } from '../src/core/analytics/collector';
import { CONSENT_RULES } from '../src/core/analytics/consent';
import { COUNTER_NUMBERS, loadCounters } from '../src/core/analytics/counters';
import { pageContext, type ShopEvent } from '../src/core/analytics/events';
import { COUNTER_KINDS } from '../src/core/analytics/settings';

// События модуля аналитики (design.md блока 11): корзина — перевод событий SDK (блок 13), формат нашего сборщика, пачки,
// счётчики мерчанта по номеру. jsdom выполняет встроенные скрипты счётчиков — проверяем вставленный код, а не сеть.
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const COLLECTOR = 'https://analytics.dev.merfy.ru';
const PAGE = {
  path: '/catalog',
  title: 'Каталог',
  referrer: 'https://yandex.ru/',
  utm: { source: 'vk', medium: '', campaign: '' },
};
const EVENT: ShopEvent = {
  type: 'add_to_cart',
  at: '2026-10-10T08:00:00.000Z',
  sessionId: 'id-1',
  visitorId: 'id-1',
  page: PAGE,
  traffic: null,
  product: { id: 'scarf-1', quantity: 2 },
};

const sources = (rules: Readonly<Record<string, RegExp>>): Record<string, string> =>
  Object.fromEntries(Object.entries(rules).map(([kind, rule]): [string, string] => [kind, rule.source]));

afterEach(() => {
  document.head.replaceChildren();
  vi.restoreAllMocks();
});

describe('корзина — события SDK → типы сборщика (блок 13, «Решил сам» 16)', () => {
  it('три события корзины каталога SDK', () => {
    expect(CART_EVENTS).toEqual(['merfy:cart:add', 'merfy:cart:remove', 'merfy:cart:change']);
  });

  it.each<[string, (typeof CART_EVENTS)[number], unknown, CartChange | null]>([
    [
      '«в корзину» — на добавленное число, цена не уходит',
      'merfy:cart:add',
      { productId: 'scarf-1', quantity: 2, price: { amount: 249000, currency: 'RUB' } },
      { type: 'add_to_cart', product: { id: 'scarf-1', quantity: 2 } },
    ],
    [
      '«из корзины»',
      'merfy:cart:remove',
      { productId: 'coat-7', quantity: 1 },
      { type: 'remove_from_cart', product: { id: 'coat-7', quantity: 1 } },
    ],
    [
      'штук больше — «в корзину» на разницу',
      'merfy:cart:change',
      { productId: 'hat-2', quantity: 5, previousQuantity: 3 },
      { type: 'add_to_cart', product: { id: 'hat-2', quantity: 2 } },
    ],
    [
      'штук меньше — «из корзины» на разницу',
      'merfy:cart:change',
      { productId: 'hat-2', quantity: 1, previousQuantity: 3 },
      { type: 'remove_from_cart', product: { id: 'hat-2', quantity: 2 } },
    ],
    ['без перемен — ничего', 'merfy:cart:change', { productId: 'hat-2', quantity: 3, previousQuantity: 3 }, null],
    ['без товара — ничего', 'merfy:cart:add', { quantity: 1 }, null],
    ['не объект — ничего', 'merfy:cart:add', null, null],
  ])('%s', (_title, name, detail, change) => {
    expect(cartChangeOf(name, detail)).toEqual(change);
  });
});

describe('наш сборщик аналитики — формат, который он уже принимает', () => {
  it('событие — поля сборщика; пустые метки рекламы и пустой трафик не уходят; цены нет', () => {
    expect(collectorEvent(EVENT)).toEqual({
      type: 'add_to_cart',
      session_id: 'id-1',
      visitor_id: 'id-1',
      page_url: '/catalog',
      page_title: 'Каталог',
      referrer: 'https://yandex.ru/',
      timestamp: '2026-10-10T08:00:00.000Z',
      utm_source: 'vk',
      product_id: 'scarf-1',
    });
  });

  it('просмотр от владельца — traffic internal, без product_id', () => {
    const view = collectorEvent({ ...EVENT, type: 'page_view', traffic: 'internal', product: null });
    expect([view.type, view.traffic, 'product_id' in view]).toEqual(['page_view', 'internal', false]);
  });

  it('пачки по 100 на <адрес>/collect с shop_id; пустая очередь — запроса нет', () => {
    const sent: { url: string; body: unknown }[] = [];
    const destination = collectorDestination(COLLECTOR, SHOP, (url, body) => {
      sent.push({ url, body: JSON.parse(body) });
      return true;
    });
    Array.from({ length: BATCH_MAX + 1 }, () => EVENT).forEach((event) => destination.push(event));
    destination.flush();
    destination.flush();
    expect(sent.map((item) => item.url)).toEqual([`${COLLECTOR}/collect`, `${COLLECTOR}/collect`]);
    expect(sent.map((item) => item.body)).toEqual([
      { shop_id: SHOP, events: Array.from({ length: BATCH_MAX }, () => collectorEvent(EVENT)) },
      { shop_id: SHOP, events: [collectorEvent(EVENT)] },
    ]);
  });

  it('пачка не ушла — запись в консоль, страница работает дальше', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const destination = collectorDestination(COLLECTOR, SHOP, () => false);
    destination.push(EVENT);
    expect(() => destination.flush()).not.toThrow();
    expect(error).toHaveBeenCalledWith('Аналитика: пачка не ушла');
  });

  it('получает события при визите и посетителе, при отказе — нет', () => {
    const destination = collectorDestination(COLLECTOR, SHOP, () => true);
    const rules = [CONSENT_RULES.unknown, CONSENT_RULES.accepted, CONSENT_RULES.declined];
    expect(rules.map((rule) => destination.allowed(rule))).toEqual([true, true, false]);
  });

  it('страница: путь — из конфига, метки рекламы — из адреса', () => {
    const href = 'https://scarves.example/catalog/?utm_source=vk&utm_campaign=autumn';
    expect(pageContext({ title: 'Каталог', referrer: '' }, href, '/catalog')).toEqual({
      path: '/catalog',
      title: 'Каталог',
      referrer: '',
      utm: { source: 'vk', medium: '', campaign: 'autumn' },
    });
  });
});

describe('счётчики мерчанта по номеру (С11-4 Б)', () => {
  it('виды и правила номеров — те же, что у схемы конфига', () => {
    expect(COUNTER_KINDS).toEqual(CONFIG_KINDS);
    expect(sources(COUNTER_NUMBERS)).toEqual(sources(CONFIG_NUMBERS));
  });

  it('Метрика, VK и Google — наш шаблон с номером, тот же, что у сборщика аналитики для нынешних тем', () => {
    loadCounters(document, [
      { kind: 'metrika', number: '12345678' },
      { kind: 'vk', number: 'VK-RTRG-1234567-AbCdE' },
      { kind: 'google', number: 'G-ABC123XYZ9' },
    ]);
    const inline = [...document.head.querySelectorAll('script:not([src])')].map((script) => script.textContent);
    const code = inline.join('\n');
    expect(code).toContain(
      'ym(12345678,"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});',
    );
    expect(code).toContain('VK.Retargeting.Init("VK-RTRG-1234567-AbCdE"),VK.Retargeting.Hit()');
    expect(code).toContain("gtag('config','G-ABC123XYZ9');");
    const external = [...document.head.querySelectorAll('script[src]')].map((script) => script.getAttribute('src'));
    expect(external).toContain('https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ9');
  });

  it('номер не по правилу — счётчик не вставляется, запись в консоль', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    loadCounters(document, [{ kind: 'metrika', number: '1);alert(1' }]);
    expect(document.head.querySelectorAll('script')).toHaveLength(0);
    expect(error).toHaveBeenCalledWith('Аналитика: счётчик metrika — номер не по правилу');
  });
});
