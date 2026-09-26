/**
 * @jest-environment jsdom
 */
/**
 * Фильтры каталога: в одном фильтре можно отметить несколько значений.
 *
 * Тестировщик: «фильтры в блум можно выбирать несколько штук, а не по одному».
 * Решение владельца: во всех пяти темах в одном фильтре (цвет, коллекции)
 * отмечается несколько значений, показываются товары с любым из них; разные
 * фильтры — через И. Раньше выбиралось одно: сервер товаров фильтровал по
 * одному значению группы, и витрина это повторяла (клик заменял выбор).
 * Сервер теперь принимает повторённый ключ (product-service
 * storefront-filters.ts, api-gateway catalog-filters.ts): `Цвет=A&Цвет=B`,
 * `collection_id=c1&collection_id=c2`.
 *
 * Путь покупателя: каталог темы нарисован тем же рендером, что витрина, его
 * скрипт исполнен в jsdom на подложенном API (группа «Цвет», две коллекции,
 * товар), клики — настоящие. Проверяем, что уходит в запрос товаров и что
 * пишется в адрес страницы; обе раскладки фильтров (строка и сайдбар).
 */
import { renderSections } from "../../../scripts/qa/lib/render";
import { BLOCK_ROOT_INLINE } from "../../common/block-root-inline";

const THEMES = ["rose", "vanilla", "satin", "bloom", "flux"] as const;
const LAYOUTS = ["top", "side"] as const;
const COLORS = ["Синий", "Красный", "Зелёный"];
const COLLECTIONS = [
  { id: "c-1", slug: "odin", name: "Один" },
  { id: "c-2", slug: "dva", name: "Два" },
];
const PRODUCT = {
  id: "p-1",
  name: "Товар",
  title: "Товар",
  slug: "p-1",
  handle: "p-1",
  price: 1000,
  basePrice: 1000,
  images: ["/f0.jpg"],
  image: "/f0.jpg",
  hasVariants: false,
  variantCombinations: [],
  variantGroups: [],
  collectionIds: ["c-1"],
};

/** Все запросы товаров, которые сделал скрипт каталога. */
const productRequests: string[] = [];

const respond = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response;

const API: [RegExp, () => unknown][] = [
  [/\/api\/store\/filters/, () => ({ success: true, data: { groups: [{ name: "Цвет", key: "цвет", values: COLORS }], priceRange: { min: 100, max: 5000 }, totalProducts: 1 } })],
  [/\/api\/store\/collections/, () => ({ collections: COLLECTIONS, total: COLLECTIONS.length })],
  [/\/api\/store\/products/, () => ({ products: [PRODUCT], data: [PRODUCT], total: 1, pagination: { page: 1, limit: 12, total: 1, totalPages: 1 } })],
  [/products\.json/, () => [PRODUCT]],
];

const hung: { target: EventTarget; type: string; fn: EventListenerOrEventListenerObject; opts?: unknown }[] = [];

beforeAll(() => {
  const origDoc = document.addEventListener.bind(document);
  const origWin = window.addEventListener.bind(window);
  document.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: unknown) => {
    hung.push({ target: document, type, fn, opts });
    origDoc(type, fn, opts as AddEventListenerOptions);
  }) as typeof document.addEventListener;
  window.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: unknown) => {
    hung.push({ target: window, type, fn, opts });
    origWin(type, fn, opts as AddEventListenerOptions);
  }) as typeof window.addEventListener;
  const fetchMock = jest.fn(async (input: unknown) => {
    const url = String(input);
    if (/\/api\/store\/products/.test(url)) productRequests.push(url);
    const hit = API.find(([re]) => re.test(url));
    return respond(hit ? hit[1]() : { data: [], items: [] });
  });
  (window as unknown as { fetch: unknown }).fetch = fetchMock;
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
});

function resetPage() {
  for (const h of hung.splice(0)) h.target.removeEventListener(h.type, h.fn, h.opts as EventListenerOptions);
  for (const k of Object.keys(window)) {
    if (k.startsWith("__merfy")) delete (window as unknown as Record<string, unknown>)[k];
  }
  for (const a of Array.from(document.body.attributes)) document.body.removeAttribute(a.name);
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/catalog");
  productRequests.length = 0;
}
afterAll(() => resetPage());

const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle(n = 30) {
  for (let i = 0; i < n; i++) await tick();
}

async function mount(theme: string, layout: string) {
  resetPage();
  (0, eval)(BLOCK_ROOT_INLINE.replace(/^<script>|<\/script>$/g, ""));
  const [r] = renderSections(theme, [
    {
      block: "Catalog",
      props: {
        id: "Catalog-1",
        siteId: "site-1",
        colorScheme: "scheme-1",
        cards: 12,
        columns: 3,
        showFilter: "true",
        showSort: "true",
        filterPosition: layout,
        productCard: { quickAdd: "none" },
      },
    },
  ]);
  if (r.error) throw new Error(`${theme}: ${r.error}`);
  const html = r.html ?? "";
  const scripts = [...html.matchAll(/<script(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  document.body.innerHTML = html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, "");
  for (const code of scripts) {
    try {
      (0, eval)(code);
    } catch {
      /* чужие узлы одиночного рендера */
    }
  }
  document.dispatchEvent(new Event("DOMContentLoaded"));
  window.dispatchEvent(new Event("load"));
  await settle(60);
}

/** Нажать на вариант фильтра (первый найденный — кнопка, пункт или флажок). */
async function pick(attr: "data-color-option" | "data-collection-option", value: string) {
  const el = document.querySelector<HTMLElement>(`[${attr}="${value}"]`);
  if (!el) throw new Error(`нет варианта ${attr}="${value}"`);
  el.click();
  await settle();
}

/** Параметры последнего запроса товаров. */
const lastQuery = () => new URLSearchParams((productRequests[productRequests.length - 1] ?? "").split("?")[1] ?? "");

describe.each(THEMES)("фильтры каталога %s: несколько значений", (theme) => {
  describe.each(LAYOUTS)("раскладка %s", (layout) => {
    beforeEach(async () => {
      await mount(theme, layout);
    }, 180_000);

    it("два цвета уходят в запрос оба, повторный клик снимает один", async () => {
      await pick("data-color-option", "Синий");
      await pick("data-color-option", "Красный");
      expect(lastQuery().getAll("Цвет")).toEqual(["Синий", "Красный"]);
      await pick("data-color-option", "Синий");
      expect(lastQuery().getAll("Цвет")).toEqual(["Красный"]);
    });

    it("две коллекции — в адрес и в запрос обе, «Все» снимает выбор", async () => {
      await pick("data-collection-option", "odin");
      await pick("data-collection-option", "dva");
      expect(new URLSearchParams(window.location.search).getAll("collection")).toEqual(["odin", "dva"]);
      expect(lastQuery().getAll("collection_id")).toEqual(["c-1", "c-2"]);
      await pick("data-collection-option", "");
      expect(new URLSearchParams(window.location.search).getAll("collection")).toEqual([]);
      expect(lastQuery().getAll("collection_id")).toEqual([]);
    });
  });
});
