import { EXT_POINT_ATTRIBUTE } from '../ext-points';
import { soldByFormOf, type SoldByForm } from '../sold-by-form';
import type { CoreHandle, InstanceHost, SdkPart } from '../types';

// Часть purchase (блок 12 «Секций и SDK», место — 12б, Р12б-12; без theme-base — 12д, Р12д-8): рантайма theme-base
// здесь нет — форму покупки показывает секция расширения. Часть прячет детей места data-ext-point="product" с
// data-product-id (кнопку «В корзину») и кнопки cart.add карточек без места (блок 15, часть 15г — как extension-sale.ts
// пяти тем на dev), если функция формы точки product включённого расширения отдала форму для товара. Клик по кнопке
// непроверенного товара ждёт ответа до SOLD_ANSWER_WAIT_MS: форма есть — клик поглощён, кнопка спрятана. Имён
// расширений часть не знает: ответ — модуль sold-by-form, места — из конфига страницы (часть 15д). В превью конструктора
// блоков нет (Р12б-17). Сборка вшивает часть магазину с включённым расширением места product, даже без места на
// странице: без расширения части в бандле нет. api — пустой замороженный объект: своих методов для секций нет.
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
    const sold = soldByFormOf(core);
    void hidePlaceChildren(sold, host);
    hideSoldButtons(sold, host.element);
    gateCartClicks(sold, host);
  },
};

const EMPTY_API: Readonly<Record<string, never>> = Object.freeze({});
const CORES = new WeakMap<Readonly<Record<string, never>>, CoreHandle>();

// Кнопки «В корзину» карточек (блок 15, часть 15г): data-action="cart.add" с товаром, без места product.
export const CART_ADD_BUTTONS = '[data-action~="cart.add"][data-product-id]';
export const SOLD_ANSWER_WAIT_MS = 3000;
// Кнопка, чей товар уже проверен и продаётся корзиной: её клики идут без задержки гейта.
const PASSED = new WeakSet<HTMLElement>();

// Дети места — кнопки товара: прячем, если товар продаётся формой (12д, Р12д-8).
async function hidePlaceChildren(sold: SoldByForm, host: InstanceHost): Promise<void> {
  const places = host.element.querySelectorAll<HTMLElement>(`[${EXT_POINT_ATTRIBUTE}="product"][data-product-id]`);
  for (const place of places) {
    const productId = place.getAttribute('data-product-id');
    if (productId === null || !(await sold.check(productId))) continue;
    for (const child of place.querySelectorAll<HTMLElement>(':scope > *')) {
      child.hidden = true;
      child.style.display = 'none';
    }
  }
}

// Кнопки карточек экземпляра: известный «да» — спрятать сразу; неизвестный — check и спрятать по ответу.
function hideSoldButtons(sold: SoldByForm, scope: ParentNode): void {
  for (const button of scope.querySelectorAll<HTMLElement>(CART_ADD_BUTTONS)) {
    void hideIfSold(sold, button);
  }
}

async function hideIfSold(sold: SoldByForm, button: HTMLElement): Promise<void> {
  const productId = button.getAttribute('data-product-id');
  if (productId === null) return;
  const known = sold.known(productId);
  if (known === true || (known === undefined && (await sold.check(productId)))) hideButton(button);
}

// Клик по кнопке cart.add — до делегата действий ядра (capture): товар с формой — клик поглощён, кнопка спрятана;
// непроверенный — ждём ответа до SOLD_ANSWER_WAIT_MS (как ANSWER_WAIT_MS на dev), обычный — клик повторяется свободно.
function gateCartClicks(sold: SoldByForm, host: InstanceHost): void {
  host.element.addEventListener(
    'click',
    (event) => gateClick(sold, host, event),
    { capture: true, signal: host.signal },
  );
}

function gateClick(sold: SoldByForm, host: InstanceHost, event: Event): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLElement>(CART_ADD_BUTTONS);
  if (button === null || !host.element.contains(button) || PASSED.has(button)) return;
  const productId = button.getAttribute('data-product-id');
  if (productId === null) return;
  const known = sold.known(productId);
  if (known === false) return; // обычный товар — клик без задержки
  event.preventDefault();
  event.stopPropagation();
  if (known === true) {
    hideButton(button);
    return;
  }
  void withDeadline(sold.check(productId)).then((isSold) => passThrough(button, isSold));
}

// Ответ проверки пришёл: с формой — кнопка спрятана; без формы — клик повторяется, кнопка свободна до конца страницы.
function passThrough(button: HTMLElement, isSold: boolean): void {
  if (isSold) {
    hideButton(button);
    return;
  }
  PASSED.add(button);
  button.click();
}

// Ответ за SOLD_ANSWER_WAIT_MS; тишина дольше — false, товар считается обычным (как ANSWER_WAIT_MS на dev).
const withDeadline = (answer: Promise<boolean>): Promise<boolean> =>
  Promise.race([answer, new Promise<boolean>((resolve) => setTimeout(() => resolve(false), SOLD_ANSWER_WAIT_MS))]);

// У кнопок карточек бывают flex-классы: display — с important, как hideElement на dev.
function hideButton(button: HTMLElement): void {
  button.hidden = true;
  button.style.setProperty('display', 'none', 'important');
}
