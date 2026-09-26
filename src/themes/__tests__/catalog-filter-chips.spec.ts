/**
 * @jest-environment jsdom
 */
/**
 * Чипы выбранных фильтров каталога.
 *
 * Владелец: «когда человек выбирает какой-то параметр, у него вверху должны
 * быть вот эти чипчики… может их удалять», во всех темах. Над товарами — чип
 * «Фильтр: значение ⊗» на каждое выбранное значение (наличие, стоимость, цвет,
 * коллекции), нажатие снимает это значение, «Очистить всё» — все. Сортировка и
 * поиск из шапки — не фильтры.
 *
 * Путь покупателя: каталог темы нарисован тем же рендером, что витрина, его
 * скрипты исполнены в jsdom на подложенном API (группа «Цвет», две коллекции,
 * товар), выбор — настоящими нажатиями по фильтрам. Проверяем подписи чипов,
 * что уходит в запрос товаров после нажатия на чип и что остаётся в адресе.
 * Обе раскладки фильтров (строка и сайдбар): контейнер чипов есть в каждой.
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

async function mount(theme: string, layout: string, extra: Record<string, unknown> = {}, url = "/catalog") {
  resetPage();
  window.history.replaceState({}, "", url);
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
        ...extra,
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

/** Контейнер чипов той раскладки, что видна покупателю. */
function chipsBox(layout: string): HTMLElement {
  const box = document.querySelector<HTMLElement>(`[data-catalog-variant="${layout}"] [data-nt="catalog-chips"]`);
  if (!box) throw new Error(`нет контейнера чипов в раскладке ${layout}`);
  return box;
}

/** Подписи чипов, как их видит покупатель; скрытый ряд — пустой список. */
const chipLabels = (layout: string) =>
  chipsBox(layout).hidden ? [] : Array.from(chipsBox(layout).querySelectorAll("[data-chip-kind]")).map((b) => (b.textContent ?? "").trim());

async function click(el: Element | null, what: string) {
  if (!el) throw new Error(`нет ${what}`);
  (el as HTMLElement).click();
  await settle();
}

const pick = (attr: "data-color-option" | "data-collection-option", value: string) =>
  click(document.querySelector(`[${attr}="${value}"]`), `варианта ${attr}="${value}"`);

/** «В наличии»: радио-кнопка наличия (у тем есть в сайдбаре и шторке). */
const pickInStock = () => click(document.querySelector('input[type="radio"][value="in"][name*="stock"]'), "радио «В наличии»");

async function typeMinPrice(value: string) {
  const input = document.querySelector<HTMLInputElement>('[data-price-input="min"]');
  if (!input) throw new Error("нет поля «от»");
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
}

const chip = (layout: string, label: string) =>
  Array.from(chipsBox(layout).querySelectorAll("[data-chip-kind]")).find((b) => (b.textContent ?? "").trim() === label) ?? null;

/** Параметры последнего запроса товаров. */
const lastQuery = () => new URLSearchParams((productRequests[productRequests.length - 1] ?? "").split("?")[1] ?? "");
const filterParams = () => {
  const q = lastQuery();
  return {
    цвет: q.getAll("Цвет"),
    коллекции: q.getAll("collection_id"),
    наличие: q.get("availability"),
    от: q.get("min_price"),
  };
};

describe.each(THEMES)("чипы фильтров каталога %s", (theme) => {
  describe.each(LAYOUTS)("раскладка %s", (layout) => {
    beforeEach(async () => {
      await mount(theme, layout);
    }, 180_000);

    it("без выбора чипов нет; выбор — чип на каждое значение и «Очистить всё»", async () => {
      expect(chipLabels(layout)).toEqual([]);
      await pickInStock();
      await typeMinPrice("100");
      await pick("data-color-option", "Синий");
      await pick("data-color-option", "Красный");
      await pick("data-collection-option", "odin");
      expect(chipLabels(layout)).toEqual([
        "Наличие: В наличии",
        "Стоимость: от 100 ₽",
        "Цвет: Синий",
        "Цвет: Красный",
        "Коллекция: Один",
        "Очистить всё",
      ]);
    });

    it("чип снимает своё значение — из запроса и из адреса, остальные на месте", async () => {
      await pick("data-color-option", "Синий");
      await pick("data-color-option", "Красный");
      await pick("data-collection-option", "odin");
      await pick("data-collection-option", "dva");
      await click(chip(layout, "Цвет: Синий"), "чипа «Цвет: Синий»");
      await click(chip(layout, "Коллекция: Один"), "чипа «Коллекция: Один»");
      expect({
        чипы: chipLabels(layout),
        запрос: filterParams(),
        адрес: new URLSearchParams(window.location.search).getAll("collection"),
      }).toEqual({
        чипы: ["Цвет: Красный", "Коллекция: Два", "Очистить всё"],
        запрос: { цвет: ["Красный"], коллекции: ["c-2"], наличие: null, от: null },
        адрес: ["dva"],
      });
    });

    it("«Очистить всё» снимает все фильтры, поля стоимости пустые, чипов нет", async () => {
      await pickInStock();
      await typeMinPrice("100");
      await pick("data-color-option", "Синий");
      await pick("data-collection-option", "odin");
      await click(chip(layout, "Очистить всё"), "«Очистить всё»");
      const prices = Array.from(document.querySelectorAll<HTMLInputElement>("[data-price-input]")).map((i) => i.value);
      expect({
        чипы: chipLabels(layout),
        запрос: filterParams(),
        адрес: window.location.search,
        поляСтоимости: [...new Set(prices)],
      }).toEqual({
        чипы: [],
        запрос: { цвет: [], коллекции: [], наличие: null, от: null },
        адрес: "",
        поляСтоимости: [""],
      });
    });
  });

  it("коллекция, закреплённая настройкой секции, — не чип, даже если в адресе другая", async () => {
    await mount(theme, "top", { collectionSlug: "odin" }, "/catalog?collection=dva");
    await pick("data-color-option", "Синий");
    expect(chipLabels("top")).toEqual(["Цвет: Синий", "Очистить всё"]);
  }, 180_000);

  it("коллекция из ссылки плитки (?collection=) — чип сразу при открытии", async () => {
    await mount(theme, "top", {}, "/catalog?collection=dva");
    expect(chipLabels("top")).toEqual(["Коллекция: Два", "Очистить всё"]);
  }, 180_000);
});
