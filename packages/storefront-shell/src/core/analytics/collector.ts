import type { ConsentRule } from './consent.ts';
import type { ShopEvent } from './events.ts';

// Адресат «наш сборщик аналитики» (design.md блока 11, решил сам 2 и 5): формат, который сборщик уже принимает, —
// POST <analytics.url>/collect, { shop_id, events[] }, в пачке до 100 событий; sendBeacon с text/plain — простой запрос
// без проверки CORS. Не ушло — запись в консоль, страница работает дальше.
// Адресат — Destination: при С11-3 Б переводчик для Метрики мерчанта встанет рядом вторым адресатом со своим правилом
// allowed (rule.counters); модуль, события и таблица согласия при этом не меняются.
export const BATCH_MAX = 100;
const COLLECT_PATH = '/collect';

export type Beacon = (url: string, body: string) => boolean;

export interface Destination {
  // Можно ли адресату получать события при этом ответе о согласии.
  allowed: (rule: ConsentRule) => boolean;
  push: (event: ShopEvent) => void;
  flush: () => void;
}

type CollectorEvent = Record<string, string>;

// Пустое значение поля не ставит — как нынешний трекер.
const optional = (key: string, value: string | null | undefined): CollectorEvent =>
  value === null || value === undefined || value === '' ? {} : { [key]: value };

export function collectorEvent(event: ShopEvent): CollectorEvent {
  return {
    type: event.type,
    session_id: event.sessionId,
    visitor_id: event.visitorId,
    page_url: event.page.path,
    page_title: event.page.title,
    referrer: event.page.referrer,
    timestamp: event.at,
    ...optional('utm_source', event.page.utm.source),
    ...optional('utm_medium', event.page.utm.medium),
    ...optional('utm_campaign', event.page.utm.campaign),
    ...optional('traffic', event.traffic),
    ...optional('product_id', event.product?.id),
  };
}

export function collectorDestination(url: string, shopId: string, beacon: Beacon): Destination {
  const queue: CollectorEvent[] = [];
  const send = (events: CollectorEvent[]): void => {
    if (!beacon(`${url}${COLLECT_PATH}`, JSON.stringify({ shop_id: shopId, events })))
      console.error('Аналитика: пачка не ушла');
  };
  return {
    allowed: (rule) => rule.identity !== 'none',
    push: (event) => void queue.push(collectorEvent(event)),
    flush: () => {
      while (queue.length > 0) send(queue.splice(0, BATCH_MAX));
    },
  };
}
