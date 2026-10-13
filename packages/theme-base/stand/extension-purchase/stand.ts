/**
 * Стенд формы покупки на странице товара: страница-заглушка «Верстака» с
 * подменой `fetch` (карта, форма, отправка), на которой запускается настоящий
 * модуль runtime/extension-purchase.ts. Нужен для сверки с эталоном экрана
 * (`mockup:check`): на dev форму руками не открыть. Собирается скриптом
 * `scripts/build-purchase-runtime.mjs --stand` в `dist/`.
 *
 * `?state=filled` — форма заполнена примером из прототипа PM (phoneFilled):
 * значения вводятся через события, как руками, поэтому проверяется и сбор
 * состояния, и отправка.
 */
import { mountExtensionPurchase } from "../../runtime/extension-purchase";
import { EXTENSION_PURCHASE_STYLES } from "../../runtime/extension-purchase.styles";
import {
  STAND_EXTENSION_ID,
  STAND_FORM_FN,
  STAND_PRODUCT,
  STAND_PRODUCT_ID,
  STAND_STORE_ID,
  STAND_SUBMIT_FN,
  VERSTAK_FORM_VIEW,
  VERSTAK_SAMPLE,
  VERSTAK_SENT,
} from "./stand-data";

const STAND_API = "https://stand.invalid/api";

/** Ответы шлюза по частям адреса: карта отдаётся как есть, функции — в обёртке {success, data}. */
const STAND_ROUTES: Array<[string, unknown]> = [
  [
    "/store/extensions/storefront",
    {
      [STAND_EXTENSION_ID]: {
        product: { form: STAND_FORM_FN, submit: STAND_SUBMIT_FN },
      },
    },
  ],
  [`/fn/${STAND_FORM_FN}`, { success: true, data: VERSTAK_FORM_VIEW }],
  [`/fn/${STAND_SUBMIT_FN}`, { success: true, data: VERSTAK_SENT }],
];

function standFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  const route = STAND_ROUTES.find(([part]) => url.includes(part));
  const status = route === undefined ? 404 : 200;
  return Promise.resolve(
    new Response(JSON.stringify(route?.[1] ?? null), { status }),
  );
}

function productHtml(): string {
  return (
    '<div class="stand-img"></div>' +
    '<div class="stand-pad">' +
    `<div class="stand-title">${STAND_PRODUCT.name}</div>` +
    `<div class="stand-price"><span>${STAND_PRODUCT.price}</span><span data-extension-purchase-note hidden></span></div>` +
    '<div data-product-actions><button type="button" class="stand-cart">В корзину</button></div>' +
    '<div class="xp" data-extension-purchase hidden></div>' +
    "</div>"
  );
}

function fire(element: Element, type: string): void {
  element.dispatchEvent(new Event(type, { bubbles: true }));
}

function setControl(root: ParentNode, selector: string, value: string): void {
  const control = root.querySelector<HTMLInputElement | HTMLSelectElement>(
    selector,
  );
  if (control === null) return;
  control.value = value;
  fire(control, "input");
  fire(control, "change");
}

function click(root: ParentNode, selector: string): void {
  root.querySelector<HTMLElement>(selector)?.click();
}

function fillSample(root: ParentNode): void {
  const { fields, buttons, checks, contacts } = VERSTAK_SAMPLE;
  Object.entries(fields).forEach(([id, value]) =>
    setControl(root, `[data-xp-field="${id}"]`, value),
  );
  Object.entries(buttons).forEach(([id, value]) =>
    click(root, `[data-xp-field="${id}"][data-xp-value="${value}"]`),
  );
  checks.forEach((id) => click(root, `[data-xp-field="${id}"]`));
  Object.entries(contacts).forEach(([key, value]) =>
    setControl(root, `[data-xp-contact="${key}"]`, value),
  );
  click(root, "[data-xp-consent]");
}

async function start(): Promise<void> {
  const host = document.getElementById("stand");
  if (host === null) return;
  window.fetch = standFetch;
  const style = document.createElement("style");
  style.textContent = EXTENSION_PURCHASE_STYLES;
  document.head.appendChild(style);
  host.innerHTML = productHtml();
  await mountExtensionPurchase(host, {
    productId: STAND_PRODUCT_ID,
    storeId: STAND_STORE_ID,
    apiBase: STAND_API,
  });
  if (new URLSearchParams(window.location.search).get("state") === "filled")
    fillSample(host);
}

void start();
