/**
 * @jest-environment jsdom
 *
 * extension-orders — поведение в браузере: строки записей расширений встают
 * среди строк заказов по дате; карта без точки, сбой сети и неверный ответ —
 * строк нет; токен покупателя уходит заголовком; ответ 201 шлюза — успех.
 * Страница записи: разбор адреса, вызов `get` с id, «не найдена» и сбой.
 * В конце — строка EXTENSION_ORDERS_RUNTIME_SOURCE ставит глобал для секции.
 */
import { mountRecordEntry, mountRecordRows } from "../runtime/extension-orders";
import { EXTENSION_ORDERS_RUNTIME_SOURCE } from "../runtime/extension-orders.runtime";
import {
  STAND_EXTENSION_ID,
  STAND_GET_FN,
  STAND_LIST_FN,
  STAND_RECORD_ID,
  STAND_STORE_ID,
  standEntry,
  standItem,
} from "../stand/extension-orders/stand-data";

interface FetchInitSeen {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

type Reply = { status: number; body: unknown } | "network-error";
interface Routes {
  map?: Reply;
  list?: Reply;
  get?: Reply;
}

const API = "https://gateway.test/api";
const TOKEN_KEY = "merfy_customer_token";
const AT_0746 = new Date(2026, 9, 13, 7, 46).toISOString();
const MAP = {
  [STAND_EXTENSION_ID]: { orders: { list: STAND_LIST_FN, get: STAND_GET_FN } },
};
/** Шлюз: карта — как есть, функции — в обёртке со статусом 201 (POST). */
const MAP_REPLY: Reply = { status: 200, body: MAP };
const listReply = (items: unknown[]): Reply => ({
  status: 201,
  body: { success: true, data: { items } },
});
const getReply = (data: unknown): Reply => ({
  status: 201,
  body: { success: true, data },
});

const calls: Array<{ url: string; init?: FetchInitSeen }> = [];

function routeOf(url: string): keyof Routes {
  if (url.includes("/store/extensions/storefront")) return "map";
  return url.includes(`/fn/${STAND_LIST_FN}`) ? "list" : "get";
}

/** Поддельный fetch: отвечает по части адреса, запоминает вызовы. */
function installFetch(routes: Routes): void {
  calls.length = 0;
  const fake = jest.fn((url: string, init?: FetchInitSeen) => {
    calls.push({ url, init });
    const reply = routes[routeOf(url)] ?? { status: 404, body: null };
    if (reply === "network-error")
      return Promise.reject(new TypeError("Failed to fetch"));
    return Promise.resolve({
      ok: reply.status < 400,
      status: reply.status,
      json: () => Promise.resolve(reply.body),
    });
  });
  (window as unknown as { fetch: unknown }).fetch = fake;
}

const channel = { storeId: STAND_STORE_ID, apiBase: API };

function coreList(dates: string[]): HTMLElement {
  const list = document.createElement("div");
  list.innerHTML = dates
    .map(
      (date, index) =>
        `<div class="account-order-row" data-date="${date}">Заказ ${index + 1}</div>`,
    )
    .join("");
  return list;
}

const order = (list: HTMLElement): string[] =>
  Array.from(list.children).map((child) => child.textContent ?? "");

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
});

describe("строки записей в «Моих заказах»", () => {
  it("встают среди заказов по дате, новые сверху", async () => {
    installFetch({
      map: MAP_REPLY,
      list: listReply([standItem("new", AT_0746)]),
    });
    const list = coreList([
      new Date(2026, 9, 13, 9, 0).toISOString(),
      new Date(2026, 9, 1, 9, 0).toISOString(),
    ]);
    const count = await mountRecordRows(list, {
      ...channel,
      entryPath: "/account/entry",
    });
    expect(count).toBe(1);
    expect(order(list)[0]).toBe("Заказ 1");
    expect(order(list)[1]).toContain("№2096 · Стол из массива по размеру");
    expect(order(list)[2]).toBe("Заказ 2");
  });

  it("ссылка строки ведёт на страницу записи этого расширения", async () => {
    installFetch({
      map: MAP_REPLY,
      list: listReply([standItem("new", AT_0746)]),
    });
    const list = coreList([]);
    await mountRecordRows(list, { ...channel, entryPath: "/account/entry" });
    expect(list.querySelector("a.xo-row")?.getAttribute("href")).toBe(
      `/account/entry?ext=${STAND_EXTENSION_ID}&id=${STAND_RECORD_ID}`,
    );
  });

  it("вызов списка: POST с пустым входом, магазин в адресе, токен покупателя заголовком", async () => {
    window.localStorage.setItem(TOKEN_KEY, "tok-1");
    installFetch({ map: MAP_REPLY, list: listReply([]) });
    await mountRecordRows(coreList([]), {
      ...channel,
      entryPath: "/account/entry",
    });
    const call = calls.find((item) => routeOf(item.url) === "list");
    expect(call?.url).toBe(
      `${API}/store/extensions/${STAND_EXTENSION_ID}/fn/${STAND_LIST_FN}?store_id=${STAND_STORE_ID}`,
    );
    expect(call?.init?.method).toBe("POST");
    expect(call?.init?.body).toBe("{}");
    expect(call?.init?.headers?.Authorization).toBe("Bearer tok-1");
  });

  it.each<[string, Routes]>([
    [
      "у расширения нет точки orders",
      { map: { status: 200, body: { a: { product: {} } } } },
    ],
    [
      "карта в обёртке {success, data}",
      { map: { status: 200, body: { success: true, data: MAP } } },
    ],
    ["сеть упала на карте", { map: "network-error" }],
    ["сеть упала на списке", { map: MAP_REPLY, list: "network-error" }],
    [
      "список ответил 401",
      { map: MAP_REPLY, list: { status: 401, body: { success: false } } },
    ],
    [
      "список вернул не ту форму",
      { map: MAP_REPLY, list: listReply([{ id: 1 }]) },
    ],
  ])("%s — строк нет, заказы на месте", async (_name, routes) => {
    installFetch(routes);
    const list = coreList([AT_0746]);
    const count = await mountRecordRows(list, {
      ...channel,
      entryPath: "/account/entry",
    });
    expect(count).toBe(0);
    expect(order(list)).toEqual(["Заказ 1"]);
  });
});

describe("страница записи", () => {
  async function mountEntry(search: string): Promise<HTMLElement> {
    const root = document.createElement("div");
    await mountRecordEntry(root, {
      ...channel,
      ordersPath: "/account/orders",
      search,
    });
    return root;
  }

  it("спрашивает get этого расширения с id из адреса и рисует запись", async () => {
    installFetch({
      map: MAP_REPLY,
      get: getReply(standEntry("wait", AT_0746)),
    });
    const root = await mountEntry(
      `?ext=${STAND_EXTENSION_ID}&id=${STAND_RECORD_ID}`,
    );
    const call = calls.find((item) => routeOf(item.url) === "get");
    expect(call?.init?.body).toBe(JSON.stringify({ id: STAND_RECORD_ID }));
    expect(root.querySelector(".xo-number")?.textContent).toBe("№2096");
    expect(root.querySelector(".xo-badge")?.textContent).toBe("Ждёт оплаты");
    expect(root.querySelector(".xo-button")?.getAttribute("href")).toBe(
      "https://pay.example.ru/l/2096",
    );
    expect(root.querySelector(".xo-back")?.getAttribute("href")).toBe(
      "/account/orders",
    );
  });

  it("расширение ответило null — «Запись не найдена»", async () => {
    installFetch({ map: MAP_REPLY, get: getReply(null) });
    const root = await mountEntry(`?ext=${STAND_EXTENSION_ID}&id=nope`);
    expect(root.textContent).toContain("Запись не найдена");
  });

  it("у расширения из адреса нет точки — «Запись не найдена», get не зовётся", async () => {
    installFetch({ map: MAP_REPLY, get: getReply(standEntry("new", AT_0746)) });
    const root = await mountEntry(`?ext=other&id=${STAND_RECORD_ID}`);
    expect(root.textContent).toContain("Запись не найдена");
    expect(calls.some((item) => routeOf(item.url) === "get")).toBe(false);
  });

  it("в адресе нет ext или id — «Запись не найдена» без запросов", async () => {
    installFetch({ map: MAP_REPLY });
    const root = await mountEntry("?id=1");
    expect(root.textContent).toContain("Запись не найдена");
    expect(calls).toHaveLength(0);
  });

  it.each<[string, Reply]>([
    ["сеть упала", "network-error"],
    [
      "ответ 502",
      { status: 502, body: { success: false, code: "invalid_output" } },
    ],
    ["запись не той формы", getReply({ number: "№1" })],
  ])("%s — «Не удалось загрузить»", async (_name, get) => {
    installFetch({ map: MAP_REPLY, get });
    const root = await mountEntry(
      `?ext=${STAND_EXTENSION_ID}&id=${STAND_RECORD_ID}`,
    );
    expect(root.textContent).toContain(
      "Не удалось загрузить. Обновите страницу.",
    );
  });
});

describe("строка рантайма для секции «Заказы»", () => {
  it("ставит window.__merfyExtensionOrders с mountRows и mountEntry", () => {
    new Function(EXTENSION_ORDERS_RUNTIME_SOURCE)();
    const global = (
      window as unknown as {
        __merfyExtensionOrders?: { mountRows?: unknown; mountEntry?: unknown };
      }
    ).__merfyExtensionOrders;
    expect(typeof global?.mountRows).toBe("function");
    expect(typeof global?.mountEntry).toBe("function");
  });
});
