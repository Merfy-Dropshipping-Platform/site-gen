import { EXTENSION_PURCHASE_RUNTIME_SOURCE } from '@merfy/theme-base/runtime/extension-purchase.runtime';
import { EXTENSION_PURCHASE_STYLES } from '@merfy/theme-base/runtime/extension-purchase.styles';
import { EXT_POINT_ATTRIBUTE } from '../ext-points';
import type { CoreHandle, InstanceHost, SdkPart } from '../types';

// Глобальный объект рантайма theme-base (Р12б-16): ядро его только читает, ставит сам рантайм, своим не перезаписывает.
interface PurchaseRuntime {
  mount?: (place: HTMLElement, options: Record<string, unknown>) => unknown;
}
declare global {
  interface Window {
    __merfyPurchase?: PurchaseRuntime;
  }
}

// Часть purchase (блок 12 «Секций и SDK», часть 12б, Р12б-16): блок расширения у кнопки «В корзину» товара —
// data-ext-point="product" с data-product-id: дети места получают data-product-actions (их находит рантайм theme-base
// и вешает обработчики), скрытый блок покупки — data-extension-purchase. Встраивается один раз на страницу, в превью
// конструктора блока нет (Р12б-17). api — пустой замороженный объект: своих методов для секций нет.
export const purchase: SdkPart<'purchase', Readonly<Record<string, never>>> = {
  name: 'purchase',
  create: (core): Readonly<Record<string, never>> => {
    CORES.set(EMPTY_API, core);
    return EMPTY_API;
  },
  attach: (api, host): void => {
    if (host.mode === 'preview') return;
    const core = CORES.get(api);
    if (core === undefined) return;
    const shopApi = shopApiOf(core);
    if (shopApi !== null) mountPurchase(host, shopApi);
  },
};

const EMPTY_API: Readonly<Record<string, never>> = Object.freeze({});
const CORES = new WeakMap<Readonly<Record<string, never>>, CoreHandle>();
const STYLE_MARK = 'data-merfy-ext-purchase';
const SCRIPT_MARK = 'data-merfy-ext-purchase-script';

interface ShopApi {
  readonly url: string;
  readonly storeId: string;
}

const shopApiOf = (core: CoreHandle): ShopApi | null => {
  const config = core.config;
  if (config === null) return null;
  return { url: config.api.url, storeId: config.shop.id };
};

// Стили и рантайм — один раз на страницу: повторные места товара используют тот же глобальный объект.
function oncePerPage(): void {
  if (document.querySelector(`style[${STYLE_MARK}]`) === null) {
    const style = document.createElement('style');
    style.setAttribute(STYLE_MARK, '');
    style.textContent = EXTENSION_PURCHASE_STYLES;
    document.head.append(style);
  }
  if (document.querySelector(`script[${SCRIPT_MARK}]`) === null) {
    const script = document.createElement('script');
    script.setAttribute(SCRIPT_MARK, '');
    script.textContent = EXTENSION_PURCHASE_RUNTIME_SOURCE;
    document.head.append(script);
  }
}

// Место товара (В12-2 А): рантайм theme-base рисует блок у кнопки «В корзину».
function mountOne(runtime: PurchaseRuntime, place: HTMLElement, api: ShopApi): void {
  for (const child of [...place.children]) child.setAttribute('data-product-actions', '');
  const holder = document.createElement('div');
  holder.setAttribute('data-extension-purchase', '');
  holder.hidden = true;
  place.append(holder);
  void runtime.mount?.(place, {
    productId: place.getAttribute('data-product-id'),
    storeId: api.storeId,
    apiBase: api.url,
  });
}

function mountPurchase(host: InstanceHost, api: ShopApi): void {
  const places = [...host.element.querySelectorAll<HTMLElement>(`[${EXT_POINT_ATTRIBUTE}="product"][data-product-id]`)];
  if (places.length === 0) return;
  oncePerPage();
  const runtime = window.__merfyPurchase;
  if (runtime === undefined) return;
  for (const place of places) mountOne(runtime, place, api);
}
