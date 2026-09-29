/**
 * @jest-environment jsdom
 */
/**
 * flux, «Группа товаров» (каталог): квадратики цвета на карточке — как в
 * «Коллекции товаров».
 *
 * Владелец 29.09 (каталог MrMerfy): «в секции Группа товаров Flux отображается
 * у товара варианты не цвет, а размер; сделать как в коллекции товаров —
 * прожимаемые цвета». Замер: у «Бесшовного топа» (Cherry Purple / Haze Pink /
 * Performance Pink, swatchHex пуст) каталог не рисовал ни одного квадратика —
 * его копия colorToHex знала только точные названия («розовый», `pink`), — а
 * под фото стояли чипы размеров «XXS XS S». «Коллекция товаров» после #197
 * показывает квадратик на каждый цвет, нажатие выбирает вариант.
 *
 * Здесь исполняется НАСТОЯЩИЙ инлайн-скрипт каталога из порта
 * (`packages/theme-flux/blocks/Catalog/Catalog.astro`) с переменными
 * define:vars, строка квадратиков `fluxCardSwatchesSource()` и строка выбора
 * варианта — в том же порядке, что на витрине. Ответ API — как у прода.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fluxCardSwatchesSource } from "../../../packages/theme-flux/blocks/Catalog/card-swatches";

const PORT = resolve(__dirname, "../../../packages/theme-flux/blocks/Catalog/Catalog.astro");

const IMG = {
  main: "https://img.test/main.jpg",
  cherry: "https://img.test/cherry.jpg",
  haze: "https://img.test/haze.jpg",
  perf: "https://img.test/perf.jpg",
};

const combo = (id: string, color: string, size: string, price: number) => ({
  id,
  title: `${size} / ${color}`,
  price,
  available: true,
  quantity: 10,
  options: { Размер: size, Цвет: color },
});

const option = (value: string, images: string[] = []) => ({ value, images, swatchHex: null });

/** Товар из /api/store/products как у прода: «Размер» первой группой, комбинации вперемешку. */
const TOP = {
  id: "p-top",
  title: "Бесшовный топ",
  basePrice: "4499.00",
  hasVariants: true,
  images: [IMG.main, IMG.cherry, IMG.haze, IMG.perf],
  variantGroups: [
    { name: "Размер", options: [option("XXS"), option("XS"), option("S")] },
    {
      name: "Цвет",
      options: [option("Cherry Purple", [IMG.cherry]), option("Haze Pink", [IMG.haze]), option("Performance Pink", [IMG.perf])],
    },
  ],
  variantCombinations: [
    combo("haze-xs", "Haze Pink", "XS", 4499),
    combo("perf-xxs", "Performance Pink", "XXS", 4299),
    combo("cherry-xs", "Cherry Purple", "XS", 4400),
    combo("cherry-xxs", "Cherry Purple", "XXS", 4490),
    combo("haze-xxs", "Haze Pink", "XXS", 4499),
  ],
};

/** Товар только с размерами — цвета у него нет. */
const SIZES_ONLY = {
  id: "p-tee",
  title: "Футболка",
  basePrice: "1990.00",
  hasVariants: true,
  images: [IMG.main],
  variantGroups: [{ name: "Размер", options: [option("S"), option("M")] }],
  variantCombinations: [
    { id: "tee-s", price: 1990, available: true, options: { Размер: "S" } },
    { id: "tee-m", price: 1990, available: true, options: { Размер: "M" } },
  ],
};

const VARS: Record<string, unknown> = {
  siteId: "shop-1",
  pageSize: 12,
  cardAspectClass: "aspect-square",
  showQuickAdd: true,
  quickAddText: "В КОРЗИНУ",
  btnStyle: "primary",
  btnBg: "#000",
  btnFg: "#fff",
  btnBorder: "1px solid #000",
  nextPhotoOn: false,
  cardContainerState: "auto",
};

/** Тело `<script>` порта, в котором (в теге или в коде) есть `marker`. */
function inlineScript(src: string, marker: string): string {
  const at = src.indexOf(marker);
  const start = src.indexOf(">", src.lastIndexOf("<script", at)) + 1;
  return src.slice(start, src.indexOf("</script>", at));
}

async function mountCatalog(): Promise<HTMLElement> {
  const src = readFileSync(PORT, "utf8");
  document.documentElement.removeAttribute("data-flux-card-swatches");
  document.body.removeAttribute("data-cf-card");
  document.body.innerHTML = `<section data-catalog-layout="side"><ul data-nt="catalog-grid"></ul></section>`;
  const w = window as unknown as Record<string, unknown>;
  delete w.__merfyFluxCardSwatches;
  w.__MERFY_API_BASE__ = "http://api.test";
  w.fetch = jest.fn(async (url: string) => {
    const products = String(url).includes("/api/store/products?");
    const body = products ? { products: [TOP, SIZES_ONLY], total: 2, pagination: { totalPages: 1 } } : {};
    return { ok: products, status: products ? 200 : 404, json: async () => body };
  });
  // Порядок как в разметке порта: квадратики → каталог → выбор варианта.
  new Function(fluxCardSwatchesSource())();
  new Function(...Object.keys(VARS), inlineScript(src, "<script is:inline define:vars"))(...Object.values(VARS));
  new Function(inlineScript(src, "window.__merfyPickDefaultCombination = function"))();
  for (let i = 0; i < 50 && !document.querySelector('[data-nt="flux-product-card"]'); i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
  return document.querySelector('[data-nt="flux-product-card"][aria-label="Бесшовный топ"]') as HTMLElement;
}

const swatches = (card: HTMLElement) => Array.from(card.querySelectorAll<HTMLElement>("[data-card-swatch]"));
const quickAdd = (card: HTMLElement) => card.querySelector("[data-quick-add-id]") as HTMLElement;

describe("flux · каталог · квадратики цвета как в «Коллекции товаров»", () => {
  it("квадратик на каждый цвет товара, выбран цвет, который кладёт «В корзину»; размеров чипами нет", async () => {
    const card = await mountCatalog();
    expect(card).not.toBeNull();
    expect(swatches(card).map((s) => [s.getAttribute("aria-label"), s.getAttribute("aria-pressed")])).toEqual([
      ["Цвет: Cherry Purple", "true"],
      ["Цвет: Haze Pink", "false"],
      ["Цвет: Performance Pink", "false"],
    ]);
    expect(quickAdd(card).getAttribute("data-variant-color")).toBe("Cherry Purple");
    expect(card.querySelector('[data-nt="card-chips"]')?.textContent?.trim()).toBe("");
  });

  it("нажатие: фото цвета, «В корзину» кладёт вариант этого цвета с первым размером", async () => {
    const card = await mountCatalog();
    swatches(card)[2].click();

    const img = card.querySelector("[data-card-img]") as HTMLElement;
    expect(img.getAttribute("src")).toBe(IMG.perf);
    expect(img.getAttribute("data-img-primary")).toBe(IMG.perf);
    const btn = quickAdd(card);
    expect({
      combo: btn.getAttribute("data-quick-add-combo-id"),
      color: btn.getAttribute("data-variant-color"),
      size: btn.getAttribute("data-variant-size"),
      price: btn.getAttribute("data-price"),
      image: btn.getAttribute("data-image"),
    }).toEqual({ combo: "perf-xxs", color: "Performance Pink", size: "XXS", price: "4299", image: IMG.perf });
    expect(swatches(card).map((s) => s.getAttribute("aria-pressed"))).toEqual(["false", "false", "true"]);
  });

  it("товар только с размерами: ни квадратиков, ни чипов размеров — как в «Коллекции товаров»", async () => {
    await mountCatalog();
    const tee = document.querySelector('[data-nt="flux-product-card"][aria-label="Футболка"]') as HTMLElement;
    expect(swatches(tee)).toEqual([]);
    expect(tee.querySelector('[data-nt="card-swatches"]')?.innerHTML).toBe("");
    expect(tee.querySelector('[data-nt="card-chips"]')?.textContent?.trim()).toBe("");
  });
});

/**
 * Классы разметки квадратиков доходят до CSS живой витрины flux: порт живая
 * сборка не сканирует (кроме узких `@source`), поэтому класс, которого нет в
 * источниках живой сборки, на витрине мёртв (memory:
 * reference_live_css_skips_port_blocks). Новое — только в `style`.
 */
describe("flux · квадратики карточки: классы есть в CSS живой витрины", () => {
  it("каждый класс разметки квадратиков встречается в источниках живой сборки flux", () => {
    const { cardSwatchesHtml } = jest.requireActual(
      "../../../packages/theme-flux/blocks/Catalog/card-swatches",
    ) as typeof import("../../../packages/theme-flux/blocks/Catalog/card-swatches");
    const pick = () => TOP.variantCombinations[3];
    const html =
      cardSwatchesHtml(TOP, pick) +
      cardSwatchesHtml({ ...TOP, variantSwatches: [{ value: "Белый", color: null, available: false }, { value: "Чёрный", color: null }] });
    const classes = new Set(Array.from(html.matchAll(/class="([^"]*)"/g)).flatMap((m) => m[1].split(/\s+/).filter(Boolean)));
    expect(classes.size).toBeGreaterThan(0);
    const live = liveFluxSourcesText();
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    const missing = [...classes].filter(
      (c) => !new RegExp(`(^|[\\s"'\`{}.])${escape(c)}($|[\\s"'\`{}:,])`, "m").test(live),
    );
    expect(missing).toEqual([]);
  });
});

/** Файлы, которые сканирует живая сборка CSS flux: папка темы + `@source` без портов каталога. */
function liveFluxSourcesText(): string {
  const { readdirSync, statSync } = jest.requireActual("node:fs") as typeof import("node:fs");
  const root = resolve(__dirname, "../../../themes/flux/src");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = resolve(dir, name);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  // Узкие @source flux на порт каталога — только эти четыре файла.
  const port = ["FluxFiltersSheet", "NtFilterSidebar", "NtRadioField", "NtFilterPriceRows"].map((n) =>
    resolve(__dirname, `../../../packages/theme-flux/blocks/Catalog/${n}.astro`),
  );
  return [...walk(root), ...port]
    .filter((f) => /\.(astro|ts|tsx|css)$/.test(f))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
}
