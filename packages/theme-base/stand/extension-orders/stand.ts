/**
 * Стенд «Моих заказов»: три страницы-заглушки «Верстака» с подменой `fetch`
 * (карта, список, страница записи), на которых работает настоящий модуль
 * runtime/extension-orders.ts. Нужен для сверки с эталонами ph-my* (`mockup:check`):
 * на dev запись расширения руками в нужное состояние не поставить. Собирается
 * скриптом `scripts/build-orders-runtime.mjs --stand` в `dist/`:
 *   index.html  — шапка магазина со ссылкой «Мои заказы» (с неё начинают эталоны);
 *   orders.html — заголовок «Мои заказы», список (строки рисует модуль), «В каталог»;
 *   entry.html  — страница записи (целиком рисует модуль).
 * Шапка, заголовок списка и «В каталог» — обвязка стенда, как в прототипе PM;
 * на витрине их рисует тема.
 *
 * `?state=new|disc|wait|closed` — состояние записи (по умолчанию new). Ссылка
 * «Мои заказы» несёт его дальше, а id записи в списке равен состоянию: модуль
 * строит ссылку на страницу записи сам, и состояние доезжает до неё в `id`.
 */
import {
  mountRecordEntry,
  mountRecordRows,
} from "../../runtime/extension-orders";
import { EXTENSION_ORDERS_STYLES } from "../../runtime/extension-orders.styles";
import { applyStandLook } from "../stand-look";
import {
  STAND_EXTENSION_ID,
  STAND_GET_FN,
  STAND_LIST_FN,
  STAND_STORE_ID,
  isStandState,
  standDate,
  standEntry,
  standItem,
  type StandState,
} from "./stand-data";

const STAND_API = "https://stand.invalid/api";
const DEFAULT_STATE: StandState = "new";
const CREATED = 201;

const STAND_MAP = {
  [STAND_EXTENSION_ID]: { orders: { list: STAND_LIST_FN, get: STAND_GET_FN } },
};

const stateOf = (value: unknown): StandState =>
  isStandState(value) ? value : DEFAULT_STATE;

const pageState = (): StandState =>
  stateOf(new URLSearchParams(window.location.search).get("state"));

const reply = (status: number, body: unknown): Promise<Response> =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function requestedId(init: RequestInit | undefined): unknown {
  const body: unknown = JSON.parse(String(init?.body ?? "{}"));
  return typeof body === "object" && body !== null && "id" in body
    ? body.id
    : undefined;
}

/** Ответы шлюза: карта — как есть, функции — в обёртке {success, data} со статусом 201, как у POST шлюза. */
function standFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = String(input);
  const date = standDate(new Date());
  if (url.includes("/store/extensions/storefront"))
    return reply(200, STAND_MAP);
  if (url.includes(`/fn/${STAND_LIST_FN}`)) {
    const state = pageState();
    const items = [{ ...standItem(state, date), id: state }];
    return reply(CREATED, { success: true, data: { items } });
  }
  if (url.includes(`/fn/${STAND_GET_FN}`))
    return reply(CREATED, {
      success: true,
      data: standEntry(stateOf(requestedId(init)), date),
    });
  return reply(404, null);
}

function headerHtml(): string {
  const orders = `orders.html${window.location.search}`;
  return (
    '<header class="stand-head">' +
    "<span>≡ Каталог</span>" +
    '<span class="stand-shop">ВЕРСТАК</span>' +
    `<a class="stand-orders" href="${orders}">Мои заказы</a>` +
    "</header>"
  );
}

const ORDERS_PAGE =
  '<h1 class="stand-h1">Мои заказы</h1>' +
  '<div class="stand-list" data-orders-list></div>' +
  '<button type="button" class="stand-catalog">В каталог</button>';

const channel = { storeId: STAND_STORE_ID, apiBase: STAND_API };

const VIEWS: Record<string, (main: HTMLElement) => Promise<unknown>> = {
  home: async () => undefined,
  orders: async (main) => {
    main.innerHTML = ORDERS_PAGE;
    const list = main.querySelector<HTMLElement>("[data-orders-list]");
    if (list === null) return;
    await mountRecordRows(list, { ...channel, entryPath: "entry.html" });
  },
  entry: async (main) => {
    main.innerHTML = '<div class="xo" data-extension-entry></div>';
    const root = main.querySelector<HTMLElement>("[data-extension-entry]");
    if (root === null) return;
    await mountRecordEntry(root, {
      ...channel,
      ordersPath: "orders.html",
      search: window.location.search,
    });
  },
};

async function start(): Promise<void> {
  const host = document.getElementById("stand");
  if (host === null) return;
  applyStandLook(host);
  window.fetch = standFetch;
  const style = document.createElement("style");
  style.textContent = EXTENSION_ORDERS_STYLES;
  document.head.appendChild(style);
  host.innerHTML = `${headerHtml()}<main class="stand-main"></main>`;
  const main = host.querySelector<HTMLElement>(".stand-main");
  const view = VIEWS[document.body.dataset.view ?? "home"];
  if (main !== null && view !== undefined) await view(main);
}

void start();
