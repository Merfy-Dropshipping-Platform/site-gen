import { watchSource } from '../stores';
import type { CartState as CoreCart, CoreHandle, EventName, ReadableStore, SdkPart } from '../types';
import { createAnalytics } from './analytics.ts';
import type { CartFeed } from './cart.ts';
import type { Beacon } from './collector.ts';

// Часть SDK «аналитика» (design.md блока 5, раздел 3.13; блок 11; часть 5б). Сборка магазина добавляет её в бандл
// каждой страницы опубликованного сайта (LIVE_PARTS в storefront-build/src/code.ts) — как трекер аналитики, который
// прод вставляет в каждую страницу. API для секций у неё нет: части нет в ModuleName, секции её не получают. Просмотр
// страницы — по merfy:page:view ядра (на document, после запуска секций), пачка — сразу при pagehide. Корзина — $cart
// части cart: модуль аналитики получает только прочитанные состояния (ready), иначе заготовка до чтения стала бы точкой
// отсчёта и чтение корзины дало бы ложные «в корзину». Части cart на странице нет — строка в консоли, просмотры уходят.
const PAGE_VIEW: EventName = 'merfy:page:view';

export interface AnalyticsEnv {
  readonly window: Window;
  readonly beacon: Beacon;
  readonly newId: () => string;
}

export type AnalyticsApi = Readonly<Record<string, never>>;

// Подписка на прочитанные состояния корзины ядра: сразу текущее, если корзина уже прочитана, потом каждое новое.
export function cartFeed(store: ReadableStore<CoreCart>): CartFeed {
  return {
    subscribe(fn) {
      const source = watchSource(store);
      if (source === null) throw new Error('у корзины ядра нет подписки');
      const deliver = (state: CoreCart): void => {
        if (state.ready) fn(state);
      };
      deliver(source.get());
      return source.listen(deliver);
    },
  };
}

// part('cart') бросает, если части нет: Promise превращает это в отказ, модуль аналитики пишет строку в консоль.
const cartOf = (core: CoreHandle): Promise<CartFeed> =>
  new Promise((resolve) => resolve(cartFeed(core.part('cart').$cart)));

export function createAnalyticsPart(env: AnalyticsEnv): SdkPart<'analytics', AnalyticsApi> {
  return {
    name: 'analytics',
    create(core) {
      const deps = { win: env.window, beacon: env.beacon, newId: env.newId, cart: () => cartOf(core) };
      const module = createAnalytics(deps);
      env.window.document.addEventListener(PAGE_VIEW, () => module.page());
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
