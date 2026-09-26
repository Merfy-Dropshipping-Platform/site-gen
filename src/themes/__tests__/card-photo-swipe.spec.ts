/**
 * @jest-environment jsdom
 */
/**
 * «Следующее фото» на телефоне: свайп по фото карточки листает фото.
 *
 * Тестировщик: «следующее фото при наведении на телефоне — при тапе, зажатии
 * фотки товара или скролле не переключается», и в конструкторе, и в магазине.
 * Листание было только от мыши. Решение владельца: свайп, как на Авито и WB.
 *
 * Путь тестировщика: в секции включено «Следующее фото», больше ничего; секция
 * нарисована тем же рендером, что витрина, её скрипты исполнены в jsdom на
 * подложенном каталоге; палец — событиями касания. Рантайм страницы темы
 * (Layout / StorefrontRuntime) здесь не рисуется, поэтому его привязку
 * `initCardPhotoSwipe()` вызываем сами, а то, что каждая тема её подключает,
 * сторожит проверка исходников внизу.
 *
 *   «Группа товаров»: bloom и vanilla — все фото по очереди, rose, satin, flux —
 *   первое и второе. «Коллекция товаров»: все темы — первое и второе.
 *   Тап без сдвига и прокрутка страницы фото не трогают; клик после свайпа не
 *   открывает товар, клик после тапа — открывает.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  SWIPE_MIN_PX,
  initCardPhotoSwipe,
  stepIndex,
  swipeStep,
} from "../../../packages/theme-base/runtime/card-photo-swipe";
import { renderSections } from "../../../scripts/qa/lib/render";
import { BLOCK_ROOT_INLINE } from "../../common/block-root-inline";

const THEMES = ["rose", "vanilla", "satin", "bloom", "flux"] as const;
/** Темы, у которых «Группа товаров» листает все фото («как на Авито»). */
const ALL_PHOTOS = new Set(["bloom", "vanilla"]);
const PHOTOS = ["/f0.jpg", "/f1.jpg", "/f2.jpg", "/f3.jpg", "/f4.jpg"];
const SITES_ROOT = resolve(__dirname, "..", "..", "..");

const product = (id: string, images: string[]) => ({
  id,
  name: `Товар ${id}`,
  title: `Товар ${id}`,
  slug: id,
  handle: id,
  price: 1000,
  basePrice: 1000,
  compareAtPrice: null,
  image: images[0],
  images,
  hasVariants: false,
  variantCombinations: [],
  variantGroups: [],
  collectionIds: ["col-1"],
});

let PRODUCTS: ReturnType<typeof product>[] = [];
const CATALOG = () => ({
  collections: [{ id: "col-1", name: "Хиты", slug: "hity", image: "", productIds: PRODUCTS.map((p) => p.id) }],
  products: PRODUCTS,
  publications: [],
});

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Слушатели, которые повесили скрипты секций, — снимаем между темами. */
const hung: { target: EventTarget; type: string; fn: EventListenerOrEventListenerObject; opts?: unknown }[] = [];

beforeAll(() => {
  // Привязка свайпа — до перехвата: её слушатели живут всю страницу, как на витрине.
  initCardPhotoSwipe();
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
  const fetchMock = jest.fn(async (url: unknown) => {
    const body = /products/.test(String(url))
      ? { data: PRODUCTS, products: PRODUCTS, items: PRODUCTS, total: PRODUCTS.length, meta: { total: PRODUCTS.length } }
      : { data: [], items: [], collections: [] };
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
  });
  (window as unknown as { fetch: unknown }).fetch = fetchMock;
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
});

function resetPage() {
  for (const h of hung.splice(0)) h.target.removeEventListener(h.type, h.fn, h.opts as EventListenerOptions);
  for (const k of Object.keys(window)) {
    if (k.startsWith("__merfy") && k !== "__merfyCardPhotoSwipe") delete (window as unknown as Record<string, unknown>)[k];
  }
  for (const a of Array.from(document.body.attributes)) document.body.removeAttribute(a.name);
  document.body.innerHTML = "";
}
afterAll(() => resetPage());

async function mount(theme: string, block: string, props: Record<string, unknown>) {
  resetPage();
  (0, eval)(BLOCK_ROOT_INLINE.replace(/^<script>|<\/script>$/g, ""));
  const [r] = renderSections(theme, [{ block, props, catalog: CATALOG() }]);
  if (r.error) throw new Error(`${theme}/${block}: ${r.error}`);
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
  for (let i = 0; i < 30; i++) await tick();
}

/** Касание: у события касания в jsdom нет конструктора Touch — точки подкладываем. */
function touch(el: Element, type: "touchstart" | "touchend", x: number, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const point = [{ clientX: x, clientY: y }];
  Object.defineProperty(event, "touches", { value: type === "touchstart" ? point : [] });
  Object.defineProperty(event, "changedTouches", { value: point });
  el.dispatchEvent(event);
}
const swipe = (el: Element, dx: number, dy = 0) => {
  touch(el, "touchstart", 200, 300);
  touch(el, "touchend", 200 + dx, 300 + dy);
};
const LEFT = -80;
const RIGHT = 80;
/** Клик по элементу; true — клик не дошёл до ссылки (погашен). */
const clickBlocked = (el: Element) => !el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

describe("правило свайпа", () => {
  it("влево — следующее, вправо — предыдущее", () => {
    expect(swipeStep(-SWIPE_MIN_PX, 0)).toBe(1);
    expect(swipeStep(SWIPE_MIN_PX, 0)).toBe(-1);
  });
  it("короткий сдвиг и вертикальная прокрутка — не свайп", () => {
    expect(swipeStep(-(SWIPE_MIN_PX - 1), 0)).toBe(0);
    expect(swipeStep(-40, 60)).toBe(0);
  });
  it("без перескока через край", () => {
    expect(stepIndex(4, 1, 5)).toBe(4);
    expect(stepIndex(0, -1, 5)).toBe(0);
  });
});

describe.each(THEMES)("«Группа товаров» %s: свайп по фото", (theme) => {
  let img: HTMLImageElement;
  beforeAll(async () => {
    PRODUCTS = [product("p-1", PHOTOS)];
    await mount(theme, "Catalog", {
      id: "Catalog-1",
      siteId: "site-1",
      colorScheme: "scheme-1",
      cards: 8,
      columns: 3,
      showFilter: "false",
      showSort: "false",
      productCard: { quickAdd: "none", nextPhoto: "true" },
    });
    const found = document.querySelector<HTMLImageElement>('[data-nt="catalog-grid"] img[data-img-primary]');
    if (!found) throw new Error(`${theme}: в сетке нет карточки с фото`);
    img = found;
  }, 180_000);

  const shown = () => img.getAttribute("src");

  it("листает фото темы и не перескакивает край", () => {
    const expected = ALL_PHOTOS.has(theme) ? PHOTOS : PHOTOS.slice(0, 2);
    const seen = [shown()];
    for (let i = 1; i < expected.length + 1; i++) {
      swipe(img, LEFT);
      seen.push(shown());
    }
    expect(seen).toEqual([...expected, expected[expected.length - 1]]);
    swipe(img, RIGHT);
    expect(shown()).toBe(expected[expected.length - 2]);
  });

  it("тап и прокрутка страницы фото не трогают", () => {
    const before = shown();
    swipe(img, -10);
    swipe(img, -40, 90);
    expect(shown()).toBe(before);
  });

  it("клик после свайпа не открывает товар, после тапа — открывает", () => {
    swipe(img, LEFT);
    expect(clickBlocked(img)).toBe(true);
    touch(img, "touchstart", 200, 300);
    touch(img, "touchend", 202, 300);
    expect(clickBlocked(img)).toBe(false);
  });
});

/**
 * У vanilla и flux ячейки «Коллекции товаров» дорисовывает модульный скрипт
 * секции (импорты storefront-hydrate и nt-cart), а его jsdom не исполнит.
 * Повторяем ровно его вывод: та же `renderCardHtml` темы внутри
 * `<li data-image-2>`. Что скрипт и дальше кладёт второе фото на <li>, сторожит
 * проверка исходника ниже.
 */
const HYDRATED_BY_MODULE = new Set(["vanilla", "flux"]);
function hydrateLikeStorefront(theme: string) {
  const { renderCardHtml } = require(`../../../themes/${theme}/src/lib/storefront-hydrate`) as {
    renderCardHtml: (p: unknown) => string;
  };
  const grid = document.querySelector('[data-nt="popular-grid"][data-next-photo]');
  if (!grid) throw new Error(`${theme}: нет сетки «Коллекции товаров» с «Следующим фото»`);
  grid.innerHTML = PRODUCTS.map(
    (p) => `<li data-product-id="${p.id}" data-image-2="${p.images[1]}">${renderCardHtml(p)}</li>`,
  ).join("");
}

describe.each(THEMES)("«Коллекция товаров» %s: свайп по фото", (theme) => {
  let cell: HTMLElement;
  beforeAll(async () => {
    PRODUCTS = [product("p-1", ["/a1.jpg", "/a2.jpg"]), product("p-2", ["/b1.jpg", "/b2.jpg"])];
    await mount(theme, "PopularProducts", {
      id: "Pop-1",
      colorScheme: "scheme-1",
      cards: 2,
      columns: 2,
      collection: "col-1",
      nextPhotoOnHover: true,
    });
    if (HYDRATED_BY_MODULE.has(theme)) hydrateLikeStorefront(theme);
    const found = document.querySelector<HTMLElement>('[data-nt="popular-grid"][data-next-photo] li[data-image-2]');
    if (!found) throw new Error(`${theme}: в сетке нет ячейки со вторым фото`);
    cell = found;
  }, 180_000);

  const photo = () => cell.querySelector("img")!;

  it("свайп влево — второе фото, вправо — снова первое", () => {
    const first = photo().getAttribute("src");
    const second = cell.getAttribute("data-image-2");
    expect(first).not.toBe(second);
    swipe(photo(), LEFT);
    expect(photo().getAttribute("src")).toBe(second);
    swipe(photo(), RIGHT);
    expect(photo().getAttribute("src")).toBe(first);
  });
});

describe("дорисовка «Коллекции товаров» кладёт второе фото на <li>", () => {
  it.each([...HYDRATED_BY_MODULE])("%s", (theme) => {
    const src = readFileSync(resolve(SITES_ROOT, `themes/${theme}/src/components/sections/Popular.astro`), "utf-8");
    expect(src).toMatch(/wantNextPhoto && Array\.isArray\(\w+\.images\) && \w+\.images\[1\]/);
    expect(src).toMatch(/`<li data-product-id="\$\{escapeHtml\(\w+\.id\)\}"\$\{img2\}>/);
  });
});

describe("каждая тема подключает свайп в рантайме страницы", () => {
  const RUNTIME: Record<(typeof THEMES)[number], string> = {
    rose: "themes/rose/src/components/StorefrontRuntime.astro",
    vanilla: "themes/vanilla/src/layouts/Layout.astro",
    satin: "themes/satin/src/layouts/Layout.astro",
    bloom: "themes/bloom/src/layouts/Layout.astro",
    flux: "themes/flux/src/layouts/Layout.astro",
  };
  it.each(THEMES)("%s", (theme) => {
    const src = readFileSync(resolve(SITES_ROOT, RUNTIME[theme]), "utf-8");
    expect(src).toMatch(/import \{ initCardPhotoSwipe \} from "[./]+\/packages\/theme-base\/runtime\/card-photo-swipe";/);
    expect(src).toMatch(/initCardPhotoSwipe\(\);/);
  });
});
