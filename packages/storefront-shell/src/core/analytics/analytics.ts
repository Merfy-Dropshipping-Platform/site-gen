import { cartChanges, type CartFeed, type CartState } from './cart.ts';
import { collectorDestination, type Beacon, type Destination } from './collector.ts';
import { consentRule } from './consent.ts';
import { loadCounters } from './counters.ts';
import { pageContext, type EventType, type PageContext, type ProductLine, type ShopEvent } from './events.ts';
import { idsFor, type IdentityEnv } from './identity.ts';
import { readSettings, type AnalyticsSettings } from './settings.ts';
import { storageOf, type KeyValue } from './storage.ts';
import { applyOwnerParam, trafficOf, type TrafficEnv } from './traffic.ts';

// Модуль аналитики магазина (design.md блока 11) — часть SDK analytics ядра секций (блок 5 «Секций и SDK», часть 5б,
// part.ts): сборка магазина добавляет её в бандл каждой страницы опубликованного сайта. Просмотр страницы — по
// merfy:page:view ядра; корзину ядра модуль слушает с первого просмотра — «в корзину» и «из корзины». Каждое событие
// заново читает ответ о согласии (С11-2 В, таблица consent.ts). Пачки — раз в 5 с и когда страница уходит в фон (решил
// сам 5); счётчики мерчанта — после загрузки страницы и только с разрешения (решил сам 13). Превью конструктора и
// магазин без analytics в конфиге ничего не отправляют (решил сам 8).
export const BATCH_MS = 5_000;
const COMPLETE: DocumentReadyState = 'complete';
const HIDDEN: DocumentVisibilityState = 'hidden';

export interface AnalyticsDeps {
  win: Window;
  beacon: Beacon;
  cart: () => Promise<CartFeed>;
  newId: () => string;
}

export interface Analytics {
  // Новая страница: просмотр; первый вызов на загрузку страницы ещё и запускает модуль.
  page: () => void;
  // Отправить накопленное сейчас (снятие секции).
  flush: () => void;
}

interface Runtime {
  deps: AnalyticsDeps;
  win: Window;
  doc: Document;
  local: KeyValue;
  session: KeyValue;
  settings: AnalyticsSettings | null;
  context: PageContext | null;
  destinations: Destination[];
  // Метка владельца из адреса страницы этой загрузки (traffic.ts).
  owner: boolean | null;
  cart: CartState | null;
  running: boolean;
  countersLoaded: boolean;
}

const identityEnv = (rt: Runtime): IdentityEnv => ({
  cookies: {
    read: () => rt.doc.cookie,
    write: (cookie) => {
      rt.doc.cookie = cookie;
    },
  },
  session: rt.session,
  now: () => Date.now(),
  newId: rt.deps.newId,
});

const trafficEnv = (rt: Runtime): TrafficEnv => ({
  location: rt.win.location,
  history: rt.win.history,
  local: rt.local,
  webdriver: rt.win.navigator.webdriver === true,
});

function maybeLoadCounters(rt: Runtime): void {
  const ready = rt.doc.readyState === COMPLETE;
  if (rt.countersLoaded || rt.settings === null || !ready || !consentRule(rt.local).counters) return;
  rt.countersLoaded = true;
  loadCounters(rt.doc, rt.settings.counters);
}

function eventsOf(
  base: Omit<ShopEvent, 'type' | 'product'>,
  started: boolean,
  type: EventType,
  product: ProductLine | null,
): ShopEvent[] {
  const start: ShopEvent[] = started ? [{ ...base, type: 'session_start', product: null }] : [];
  return [...start, { ...base, type, product }];
}

// Событие по правилу согласия: адресаты, которым можно, → номера визита и посетителя → в пачки адресатов.
function emit(rt: Runtime, type: EventType, product: ProductLine | null): void {
  const rule = consentRule(rt.local);
  const targets = rt.destinations.filter((destination) => destination.allowed(rule));
  const ids = targets.length > 0 ? idsFor(rule.identity, identityEnv(rt)) : null;
  const page = rt.context;
  if (ids === null || page === null) return;
  const traffic = trafficOf(trafficEnv(rt), rt.owner);
  const base = { at: new Date().toISOString(), sessionId: ids.sessionId, visitorId: ids.visitorId, page, traffic };
  const events = eventsOf(base, ids.started, type, product);
  targets.forEach((target) => events.forEach((event) => target.push(event)));
}

function record(rt: Runtime, type: EventType, product: ProductLine | null): void {
  emit(rt, type, product);
  maybeLoadCounters(rt);
}

// Корзина ядра: первое состояние — точка отсчёта, дальше — разница с прошлым.
function onCart(rt: Runtime, state: CartState): void {
  const before = rt.cart;
  rt.cart = state;
  if (before === null) return;
  cartChanges(before, state).forEach((change) => record(rt, change.type, change.product));
}

function flush(rt: Runtime): void {
  rt.destinations.forEach((destination) => destination.flush());
}

// Запуск — один раз на загрузку страницы: адресаты, таймер пачек, уход в фон, загрузка страницы, корзина ядра.
function start(rt: Runtime, settings: AnalyticsSettings): void {
  rt.running = true;
  rt.destinations = [collectorDestination(settings.url, settings.shopId, rt.deps.beacon)];
  setInterval(() => flush(rt), BATCH_MS);
  rt.doc.addEventListener('visibilitychange', () => {
    if (rt.doc.visibilityState === HIDDEN) flush(rt);
  });
  if (rt.doc.readyState !== COMPLETE) rt.win.addEventListener('load', () => maybeLoadCounters(rt), { once: true });
  rt.deps
    .cart()
    .then((cart) => void cart.subscribe((state) => onCart(rt, state)))
    .catch((error: unknown) => console.error('Аналитика: нет корзины ядра', error));
}

function page(rt: Runtime): void {
  const settings = readSettings(rt.doc);
  if (settings === null || !settings.live) return;
  rt.settings = settings;
  rt.owner = applyOwnerParam(trafficEnv(rt)) ?? rt.owner;
  rt.context = pageContext(rt.doc, rt.win.location.href, settings.path);
  if (!rt.running) start(rt, settings);
  record(rt, 'page_view', null);
}

export function createAnalytics(deps: AnalyticsDeps): Analytics {
  const rt: Runtime = {
    deps,
    win: deps.win,
    doc: deps.win.document,
    local: storageOf(() => deps.win.localStorage),
    session: storageOf(() => deps.win.sessionStorage),
    settings: null,
    context: null,
    destinations: [],
    owner: null,
    cart: null,
    running: false,
    countersLoaded: false,
  };
  return { page: () => page(rt), flush: () => flush(rt) };
}
