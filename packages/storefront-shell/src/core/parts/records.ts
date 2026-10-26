import { EXTENSION_ORDERS_RUNTIME_SOURCE } from '@merfy/theme-base/runtime/extension-orders.runtime';
import { EXTENSION_ORDERS_STYLES } from '@merfy/theme-base/runtime/extension-orders.styles';
import { EXT_POINT_ATTRIBUTE } from '../ext-points';
import type { CoreHandle, InstanceHost, SdkPart } from '../types';

// Глобальный объект строк рантайта theme-base (Р12б-16): ядро его только читает, ставит сам рантайм.
interface OrdersRuntime {
  mountRows?: (list: HTMLElement, options: Record<string, unknown>) => Promise<number>;
  mountEntry?: (root: HTMLElement, options: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    __merfyExtensionOrders?: OrdersRuntime;
  }
}

// Часть records (блок 12 «Секций и SDK», часть 12б, Р12б-16): блоки расширений в месте data-ext-point «orders» —
// строки рантайма theme-base (EXTENSION_ORDERS_RUNTIME_SOURCE и его стили): идёт только на страницы, где шаблон секции
// дал место, и встраивается в страницу один раз. В превью конструктора блоков нет (Р12б-17). api — пустой замороженный
// объект: своих методов для секций нет.
export const records: SdkPart<'records', Readonly<Record<string, never>>> = {
  name: 'records',
  create: (core): Readonly<Record<string, never>> => {
    CORES.set(EMPTY_API, core);
    return EMPTY_API;
  },
  attach: (api, host): void => {
    if (host.mode === 'preview') return;
    const core = CORES.get(api);
    if (core === undefined) return;
    const shopApi = shopApiOf(core);
    if (shopApi !== null) mountRecords(host, shopApi);
  },
};

const EMPTY_API: Readonly<Record<string, never>> = Object.freeze({});
const CORES = new WeakMap<Readonly<Record<string, never>>, CoreHandle>();
const STYLE_MARK = 'data-merfy-ext-orders';
const SCRIPT_MARK = 'data-merfy-ext-orders-script';

interface ShopApi {
  readonly url: string;
  readonly storeId: string;
}

const shopApiOf = (core: CoreHandle): ShopApi | null => {
  const config = core.config;
  if (config === null) return null;
  return { url: config.api.url, storeId: config.shop.id };
};

// Стили и рантайм — один раз на страницу: повторные секции с местом «orders» используют тот же глобальный объект.
function oncePerPage(): void {
  if (document.querySelector(`style[${STYLE_MARK}]`) === null) {
    const style = document.createElement('style');
    style.setAttribute(STYLE_MARK, '');
    style.textContent = EXTENSION_ORDERS_STYLES;
    document.head.append(style);
  }
  if (document.querySelector(`script[${SCRIPT_MARK}]`) === null) {
    const script = document.createElement('script');
    script.setAttribute(SCRIPT_MARK, '');
    script.textContent = EXTENSION_ORDERS_RUNTIME_SOURCE;
    document.head.append(script);
  }
}

function mountOne(runtime: OrdersRuntime, place: HTMLElement, api: ShopApi): void {
  const options = {
    storeId: api.storeId,
    apiBase: api.url,
    entryPath: location.pathname,
    ordersPath: location.pathname,
  };
  const entry = new URLSearchParams(location.search).has('ext');
  if (entry) void runtime.mountEntry?.(place, { ...options, search: location.search });
  else void runtime.mountRows?.(place, options);
}

// «Заказы» (В12-2 А): список на /account/orders, запись одной — на /account/orders?ext=<id> (Р12б-16).
function mountRecords(host: InstanceHost, api: ShopApi): void {
  const places = [...host.element.querySelectorAll<HTMLElement>(`[${EXT_POINT_ATTRIBUTE}="orders"]`)];
  if (places.length === 0) return;
  oncePerPage();
  const runtime = window.__merfyExtensionOrders;
  if (runtime === undefined) return;
  for (const place of places) mountOne(runtime, place, api);
}
