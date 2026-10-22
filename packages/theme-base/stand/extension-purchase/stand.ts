/**
 * Стенд формы покупки на странице товара: страница-заглушка «Верстака» с
 * подменой `fetch` (карта, форма, отправка, загрузка файлов), на которой
 * запускается настоящий модуль runtime/extension-purchase.ts. Нужен для
 * сверки с эталоном экрана (`mockup:check`): на dev форму руками не открыть.
 * Собирается скриптом `scripts/build-purchase-runtime.mjs --stand` в `dist/`.
 *
 * `?state=filled` — форма заполнена примером из прототипа PM (phoneFilled):
 * значения вводятся через события, как руками, поэтому проверяется и сбор
 * состояния, и отправка.
 * `?state=files` — то же и три фото в пункте «Фото комнаты» (эталон
 * ph-product-form-files): файлы выбираются через `change` у поля файла и
 * проходят настоящую загрузку в три шага против подменённого шлюза.
 */
import { mountExtensionPurchase } from "../../runtime/extension-purchase";
import { applyStandLook } from "../stand-look";
import { EXTENSION_PURCHASE_STYLES } from "../../runtime/extension-purchase.styles";
import {
  STAND_EXTENSION_ID,
  STAND_FORM_FN,
  STAND_PHOTOS,
  STAND_PRODUCT,
  STAND_PRODUCT_ID,
  STAND_STORE_ID,
  STAND_SUBMIT_FN,
  VERSTAK_FORM_VIEW,
  VERSTAK_SAMPLE,
  VERSTAK_SENT,
} from "./stand-data";

const STAND_API = "https://stand.invalid/api";
const STAND_STORAGE = "https://stand.invalid/storage";

interface StandReply {
  status: number;
  body: unknown;
}

let standFiles = 0;

/** Шаг 1 загрузки: новый id файла и форма хранилища стенда. */
function startReply(): StandReply {
  standFiles += 1;
  const fileId = `stand-file-${standFiles}`;
  const upload = { url: STAND_STORAGE, fields: { key: fileId } };
  return { status: 201, body: { success: true, data: { fileId, upload } } };
}

/** Шаг 3: файл из адреса готов. */
function completeReply(url: string): StandReply {
  const fileId = /\/files\/([^/]+)\/complete/.exec(url)?.[1] ?? "";
  const data = { fileId, status: "ready" };
  return { status: 201, body: { success: true, data } };
}

/** Ответы по частям адреса: карта отдаётся как есть, функции — в обёртке {success, data}. */
const STAND_ROUTES: Array<[string, (url: string) => StandReply]> = [
  [
    "/store/extensions/storefront",
    () => ({
      status: 200,
      body: {
        [STAND_EXTENSION_ID]: {
          product: { form: STAND_FORM_FN, submit: STAND_SUBMIT_FN },
        },
      },
    }),
  ],
  [
    `/fn/${STAND_FORM_FN}`,
    () => ({ status: 200, body: { success: true, data: VERSTAK_FORM_VIEW } }),
  ],
  [
    `/fn/${STAND_SUBMIT_FN}`,
    () => ({ status: 200, body: { success: true, data: VERSTAK_SENT } }),
  ],
  ["/complete?", completeReply],
  ["/files?", startReply],
  [STAND_STORAGE, () => ({ status: 204, body: null })],
];

function standFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  const route = STAND_ROUTES.find(([part]) => url.includes(part));
  const reply =
    route === undefined ? { status: 404, body: null } : route[1](url);
  const text = reply.status === 204 ? null : JSON.stringify(reply.body);
  return Promise.resolve(new Response(text, { status: reply.status }));
}

function productHtml(): string {
  return (
    '<div class="stand-img"></div>' +
    '<div class="stand-pad">' +
    `<div class="stand-title">${STAND_PRODUCT.name}</div>` +
    `<div class="stand-price"><span>${STAND_PRODUCT.price}</span><span data-extension-purchase-note hidden></span></div>` +
    '<div data-product-quantity><button type="button">−</button> 1 <button type="button">+</button></div>' +
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

/** Картинка PNG одного цвета — как фото, которое покупатель выбрал в телефоне. */
function photoFile(name: string, color: string): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 120;
  const context = canvas.getContext("2d");
  if (context !== null) {
    context.fillStyle = color;
    context.fillRect(0, 0, 120, 120);
  }
  return new Promise((resolve) =>
    canvas.toBlob((blob) =>
      resolve(new File([blob ?? ""], name, { type: "image/png" })),
    ),
  );
}

/** Выбор файлов так, как его делает окно выбора: files у поля и событие change. */
async function attachPhotos(root: ParentNode): Promise<void> {
  const input = root.querySelector<HTMLInputElement>(
    `[data-xp-file="${STAND_PHOTOS.field}"]`,
  );
  if (input === null) return;
  const files = await Promise.all(
    STAND_PHOTOS.files.map(({ name, color }) => photoFile(name, color)),
  );
  const transfer = new DataTransfer();
  files.forEach((file) => transfer.items.add(file));
  input.files = transfer.files;
  fire(input, "change");
}

const STATES: Record<string, (root: ParentNode) => Promise<void>> = {
  filled: async (root) => fillSample(root),
  files: async (root) => {
    fillSample(root);
    await attachPhotos(root);
  },
};

async function start(): Promise<void> {
  const host = document.getElementById("stand");
  if (host === null) return;
  applyStandLook(host);
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
  const state = new URLSearchParams(window.location.search).get("state");
  const fill = state === null ? undefined : STATES[state];
  if (fill !== undefined) await fill(host);
}

void start();
