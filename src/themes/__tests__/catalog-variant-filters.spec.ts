/**
 * @jest-environment jsdom
 */
/**
 * Фильтры каталога по всем параметрам товара, не только по «Цвету».
 *
 * Владелец: чипы вида «Формат: А6 ⊗» над товарами во всех темах. Такой чип
 * возможен, только если параметр можно выбрать, а темы фильтровали по одному
 * «Цвету», хотя сервер отдаёт все группы вариантов (/api/store/filters). В
 * магазине владельца у товаров «Оттенок», «Размер», «Формат» и «Цвет»; на проде
 * «Размер» — у 521 товара в 32 магазинах.
 *
 * Путь покупателя: каталог темы нарисован тем же рендером, что витрина, его
 * скрипты исполнены в jsdom на подложенном API (группы «Цвет», «Размер»,
 * «Формат»), выбор — настоящими нажатиями. Проверяем, что фильтр каждой
 * группы есть в видимой раскладке, что уходит в запрос товаров, что отмечено в
 * самом фильтре и какие чипы над товарами. Обе раскладки (строка и сайдбар).
 */
import { renderSections } from "../../../scripts/qa/lib/render";
import { BLOCK_ROOT_INLINE } from "../../common/block-root-inline";

const THEMES = ["rose", "vanilla", "satin", "bloom", "flux"] as const;
const LAYOUTS = ["top", "side"] as const;
const GROUPS = [
  { name: "Цвет", key: "цвет", values: ["Синий", "Красный"] },
  { name: "Размер", key: "размер", values: ["S", "M", "L"] },
  { name: "Формат", key: "формат", values: ["Порошок", "Набор (протеин + стики)"] },
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
  collectionIds: [],
};

const productRequests: string[] = [];
/** Группы, которые отдаёт /api/store/filters в текущем тесте. */
let storeGroups: { name: string; key: string; values: string[] }[] = GROUPS;
const respond = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response;
const API: [RegExp, () => unknown][] = [
  [/\/api\/store\/filters/, () => ({ success: true, data: { groups: storeGroups, priceRange: { min: 100, max: 5000 }, totalProducts: 1 } })],
  [/\/api\/store\/collections/, () => ({ collections: [], total: 0 })],
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

async function mount(theme: string, layout: string, groups = GROUPS) {
  resetPage();
  storeGroups = groups;
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

/**
 * Варианты значения группы: кнопка/пункт у rose-семейства (группа — на самом
 * варианте), флажок или кнопка у vanilla (группа — на коробке фильтра).
 * Сравнение атрибутов, а не селектор со значением: разбор селекторов jsdom
 * спотыкается о «(» и «+» в значении («Набор (протеин + стики)»).
 */
const optionsOf = (group: string, value: string) =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-variant-option]")).filter(
    (el) =>
      el.getAttribute("data-variant-option") === value &&
      el.closest("[data-variant-group]")?.getAttribute("data-variant-group") === group,
  );

async function pick(group: string, value: string) {
  const [el] = optionsOf(group, value);
  if (!el) throw new Error(`нет варианта «${group}: ${value}»`);
  el.click();
  await settle();
}

/** Что отмечено в самих фильтрах группы (все места: строка, сайдбар, шторка). */
function pickedInFilters(group: string): string[] {
  const values = GROUPS.find((g) => g.name === group)!.values;
  return values.filter((value) =>
    optionsOf(group, value).some((el) => el.getAttribute("aria-pressed") === "true" || (el as HTMLInputElement).checked === true),
  );
}

/** Спрятан ли узел в разметке (display:none у него или у предка внутри корня). */
const hiddenWithin = (el: Element, root: Element) => {
  for (let node: Element | null = el; node && node !== root; node = node.parentElement) {
    if ((node as HTMLElement).style?.display === "none") return true;
  }
  return false;
};

/**
 * Подписи фильтров, что видит покупатель: в строке или сайдбаре раскладки
 * (без шторки телефона) либо в самой шторке. Спрятанные — не в счёт.
 */
function filterTitles(layout: string, place: "раскладка" | "шторка" = "раскладка"): string[] {
  const root = document.querySelector(`[data-catalog-variant="${layout}"]`);
  const scope = place === "шторка" ? root?.querySelector("[data-filters-sheet]") : root;
  if (!scope) throw new Error(`нет места «${place}» в раскладке ${layout}`);
  return Array.from(scope.querySelectorAll("span, p"))
    .filter((el) => el.children.length === 0)
    .filter((el) => place === "шторка" || !el.closest("[data-filters-sheet]"))
    .filter((el) => !hiddenWithin(el, scope))
    .map((el) => (el.textContent ?? "").trim())
    .filter((text) => GROUPS.some((g) => g.name === text));
}

const lastQuery = () => new URLSearchParams((productRequests[productRequests.length - 1] ?? "").split("?")[1] ?? "");
const variantParams = () => ({ размер: lastQuery().getAll("Размер"), формат: lastQuery().getAll("Формат") });

function chipLabels(layout: string): string[] {
  const box = document.querySelector<HTMLElement>(`[data-catalog-variant="${layout}"] [data-nt="catalog-chips"]`);
  if (!box || box.hidden) return [];
  return Array.from(box.querySelectorAll("[data-chip-kind]")).map((b) => (b.textContent ?? "").trim());
}

async function clickChip(layout: string, label: string) {
  const chip = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-catalog-variant="${layout}"] [data-nt="catalog-chips"] [data-chip-kind]`),
  ).find((b) => (b.textContent ?? "").trim() === label);
  if (!chip) throw new Error(`нет чипа «${label}»`);
  chip.click();
  await settle();
}

describe.each(THEMES)("фильтры по параметрам товара в шторке телефона %s", (theme) => {
  it("в шторке у каждой группы свой фильтр, выбор в шторке — в запрос и чипом", async () => {
    await mount(theme, "top");
    const titles = [...new Set(filterTitles("top", "шторка"))];
    const inSheet = optionsOf("Размер", "S").find((el) => el.closest("[data-filters-sheet]"));
    if (!inSheet) throw new Error("в шторке нет варианта «Размер: S»");
    inSheet.click();
    await settle();
    expect({ titles, запрос: variantParams(), чипы: chipLabels("top") }).toEqual({
      titles: ["Цвет", "Размер", "Формат"],
      запрос: { размер: ["S"], формат: [] },
      чипы: ["Размер: S", "Очистить всё"],
    });
  }, 180_000);

  it("группа со служебным именем (q, tags, sort…) — не фильтр и не в запросе", async () => {
    await mount(theme, "top", [...GROUPS, { name: "q", key: "q", values: ["x"] }]);
    expect({ пунктов: optionsOf("q", "x").length, q: lastQuery().getAll("q") }).toEqual({ пунктов: 0, q: [] });
  }, 180_000);
});

describe.each(THEMES)("фильтры по параметрам товара %s", (theme) => {
  describe.each(LAYOUTS)("раскладка %s", (layout) => {
    beforeEach(async () => {
      await mount(theme, layout);
    }, 180_000);

    it("у каждой группы свой фильтр рядом с «Цветом»", () => {
      expect([...new Set(filterTitles(layout))]).toEqual(["Цвет", "Размер", "Формат"]);
    });

    it("у магазина без «Цвета» фильтры параметров видны", async () => {
      await mount(theme, layout, GROUPS.filter((g) => g.name !== "Цвет"));
      expect([...new Set(filterTitles(layout))]).toEqual(["Размер", "Формат"]);
    });

    it("несколько значений в группе и разные группы — в запросе, в фильтре и чипами", async () => {
      await pick("Размер", "M");
      await pick("Размер", "L");
      await pick("Формат", "Порошок");
      expect({
        запрос: variantParams(),
        отмечено: { размер: pickedInFilters("Размер"), формат: pickedInFilters("Формат") },
        чипы: chipLabels(layout),
      }).toEqual({
        запрос: { размер: ["M", "L"], формат: ["Порошок"] },
        отмечено: { размер: ["M", "L"], формат: ["Порошок"] },
        чипы: ["Размер: M", "Размер: L", "Формат: Порошок", "Очистить всё"],
      });
    });

    it("повторное нажатие и чип снимают значение, «Очистить всё» — все параметры", async () => {
      await pick("Размер", "M");
      await pick("Размер", "L");
      await pick("Формат", "Набор (протеин + стики)");
      await pick("Размер", "L");
      await clickChip(layout, "Размер: M");
      const afterOne = { запрос: variantParams(), отмечено: pickedInFilters("Размер"), чипы: chipLabels(layout) };
      await clickChip(layout, "Очистить всё");
      expect({
        послеЧипа: afterOne,
        послеОчистки: { запрос: variantParams(), отмечено: pickedInFilters("Формат"), чипы: chipLabels(layout) },
      }).toEqual({
        послеЧипа: {
          запрос: { размер: [], формат: ["Набор (протеин + стики)"] },
          отмечено: [],
          чипы: ["Формат: Набор (протеин + стики)", "Очистить всё"],
        },
        послеОчистки: { запрос: { размер: [], формат: [] }, отмечено: [], чипы: [] },
      });
    });
  });
});
