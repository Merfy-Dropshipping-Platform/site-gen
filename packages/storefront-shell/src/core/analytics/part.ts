import type { CoreHandle, EventName, SdkPart } from '../types';
import { createAnalytics, type Analytics } from './analytics.ts';
import type { Beacon } from './collector.ts';
import { readConsent } from './consent.ts';
import { customCodeRunner, type CustomCode } from './custom-code.ts';
import { CART_EVENTS, cartChangeOf } from './sdk-events.ts';
import { storageOf } from './storage.ts';

// Часть SDK «аналитика» (design.md блока 5, раздел 3.13; блок 11; части 5б и 13а). Сборка магазина добавляет её в бандл
// каждой страницы опубликованного сайта (LIVE_PARTS в storefront-build/src/code.ts); API для секций у неё нет. Часть
// слушает события ядра на document: просмотр — merfy:page:view, корзина — merfy:cart:* (перевод — sdk-events.ts), ответ
// на баннер cookie — merfy:consent:change (его шлёт часть consent); пачка — сразу при pagehide. «Свой код» мерчанта
// (custom-code.ts) — после merfy:page:ready и при смене ответа, только на опубликованном сайте. Ответ часть читает сама
// из того же ключа, что пишет часть consent: на странице без баннера ответа нет — «не ответил» (Р13а-7).
const PAGE_READY: EventName = 'merfy:page:ready';
const PAGE_VIEW: EventName = 'merfy:page:view';
const CONSENT_CHANGE: EventName = 'merfy:consent:change';

export interface AnalyticsEnv {
  readonly window: Window;
  readonly beacon: Beacon;
  readonly newId: () => string;
}

export type AnalyticsApi = Readonly<Record<string, never>>;

const detailOf = (event: Event): unknown => (event instanceof CustomEvent ? event.detail : null);

const customOf = (core: CoreHandle): readonly CustomCode[] =>
  core.mode === 'live' ? (core.config?.analytics?.custom ?? []) : [];

function listenCart(doc: Document, module: Analytics): void {
  CART_EVENTS.forEach((name) =>
    doc.addEventListener(name, (event) => {
      const change = cartChangeOf(name, detailOf(event));
      if (change !== null) module.cart(change);
    }),
  );
}

export function createAnalyticsPart(env: AnalyticsEnv): SdkPart<'analytics', AnalyticsApi> {
  return {
    name: 'analytics',
    create(core) {
      const doc = env.window.document;
      const module = createAnalytics({ win: env.window, beacon: env.beacon, newId: env.newId });
      const local = storageOf(() => env.window.localStorage);
      const custom = customCodeRunner(doc, customOf(core));
      doc.addEventListener(PAGE_VIEW, () => module.page());
      doc.addEventListener(PAGE_READY, () => custom.apply(readConsent(local)));
      doc.addEventListener(CONSENT_CHANGE, () => {
        module.consent();
        custom.apply(readConsent(local));
      });
      listenCart(doc, module);
      env.window.addEventListener('pagehide', () => module.flush());
      return {};
    },
  };
}

// Часть для бандла страницы: sendBeacon с text/plain — простой запрос без проверки CORS, доходит и при уходе со
// страницы (решил сам 5 блока 11).
export const analytics: SdkPart<'analytics', AnalyticsApi> = {
  name: 'analytics',
  create: (core) =>
    createAnalyticsPart({
      window,
      beacon: (url, body) => navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' })),
      newId: () => crypto.randomUUID(),
    }).create(core),
};
