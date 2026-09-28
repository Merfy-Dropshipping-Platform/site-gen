/**
 * «Настройки темы» → «Карточки товара» → «Стиль»: «Стандарт» — без подложки,
 * «Карточка» — подложка цвета «Поверхность» схемы СВОЕЙ секции. Замер в
 * браузере, в секции с НЕ дефолтной схемой.
 *
 * Баг владельца 28.09 (flux): «при смене цветовой схемы в секции коллекция
 * товаров сам превращает товары в вид Карточка, хотя настройка темы выставлена
 * Стандарт». Замер прода до правки (магазин 695f190f, «Коллекция товаров» на
 * scheme-1, стиль «Стандарт»): у карточки background rgb(251,251,251),
 * padding 12px, radius 12px на чёрной секции, а название — белое
 * (--color-text схемы) на светлой плашке, то есть не читается.
 *
 * Причина. Карточка flux из вёрстки верстальщиков несла свою плашку утилитой
 * Tailwind прямо на корне: `bg-[#FBFBFB]` (FluxProductCard.astro и клиентская
 * дорисовка renderCardHtml — именно она рисует «Коллекцию товаров» на
 * витрине) и `bg-[rgb(var(--color-surface))]` (заглушки Popular.astro).
 * Правило темы `[data-nt="flux-product-card"]{background:var(--product-card-bg)}`
 * лежит в `@layer base`, а утилита — в `@layer utilities`, и слой утилит бьёт
 * base. Обводку/скругление/отступ 09.09 спасли `!important`, фон оставили
 * («карточка flux жёстко светлая»). На светлой схеме по умолчанию плашка
 * #FBFBFB почти не видна на белом, на другой схеме — видна: «Стандарт»
 * выглядел «Карточкой». С 25.09 название и цена следуют цвету текста схемы
 * (862220dc) — белый текст лёг на светлую плашку.
 *
 * Сторожим РЕЗУЛЬТАТ (computed background-color в chromium), все пять тем,
 * все живые пути карточки «Коллекции товаров»: SSR с товарами, SSR-заглушки
 * без коллекции, клиентская дорисовка `renderCardHtml`.
 *
 * Требует сборки: pnpm build, pnpm build:blocks, pnpm build:theme-sections:all.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { chromium, type Browser } from "playwright";

import { buildTokensCss } from "../tokens-css";
import { pageHtml, renderSections } from "../../../scripts/qa/lib/render";
import { loadTesterSchemes } from "../../../scripts/qa/lib/schemes";

const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
type Theme = (typeof THEMES)[number];
type Style = "standard" | "card";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const TRANSPARENT = "rgba(0, 0, 0, 0)";
/** Схема секции — не схема сайта по умолчанию, поверхность ≠ фон. */
const SECTION_SCHEME = "scheme-3";
const SCHEMES = loadTesterSchemes();

const hexToRgb = (hex: string): string => {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const SURFACE = hexToRgb(
  String((SCHEMES.find((s) => s.id === SECTION_SCHEME) as { surfaceBg: string }).surfaceBg),
);
/** Стиль → ожидаемая подложка карточки в секции SECTION_SCHEME. */
const EXPECTED: Record<Style, string> = { standard: TRANSPARENT, card: SURFACE };

const product = (id: string) => ({
  id,
  name: `Товар ${id}`,
  title: `Товар ${id}`,
  slug: id,
  handle: id,
  price: 1000,
  basePrice: 1000,
  compareAtPrice: null,
  image: `/${id}.jpg`,
  images: [`/${id}.jpg`],
  hasVariants: false,
  variantCombinations: [],
  variantGroups: [],
  collectionIds: ["col-1"],
});
const PRODUCTS = [product("p-1"), product("p-2")];
const CATALOG = {
  collections: [{ id: "col-1", name: "Хиты", slug: "hity", image: "", productIds: PRODUCTS.map((p) => p.id) }],
  products: PRODUCTS,
  publications: [],
};

const POPULAR = { id: "Popular-1", colorScheme: SECTION_SCHEME, cards: 2, columns: 2 };

const stripScripts = (html: string): string => html.replace(/<script\b[\s\S]*?<\/script>/gi, "");

/** Клиентская дорисовка карточки темы (то, что «Коллекция товаров» рисует на витрине). */
function hydratedCards(theme: Theme): string | null {
  const path = resolve(SITES_ROOT, "themes", theme, "src", "lib", "storefront-hydrate.ts");
  if (!/export function renderCardHtml\b/.test(readFileSync(path, "utf8"))) return null;
  const { renderCardHtml } = require(path) as { renderCardHtml: (p: unknown) => string };
  return `<ul data-nt="popular-grid">${PRODUCTS.map((p) => `<li>${renderCardHtml(p)}</li>`).join("")}</ul>`;
}

/** Все живые пути карточки: имя пути → HTML секции. */
function cardPaths(theme: Theme): [string, string][] {
  const [withProducts, placeholders] = renderSections(theme, [
    { block: "PopularProducts", props: { ...POPULAR, collection: "col-1" }, catalog: CATALOG },
    { block: "PopularProducts", props: POPULAR },
  ]);
  const paths: [string, string | undefined | null][] = [
    ["SSR с товарами", withProducts?.html],
    ["SSR-заглушки", placeholders?.html],
    ["дорисовка renderCardHtml", hydratedCards(theme)],
  ];
  return paths.filter((p): p is [string, string] => typeof p[1] === "string");
}

let shared: Browser | null = null;
async function browser(): Promise<Browser> {
  if (shared) return shared;
  shared = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
  return shared;
}
// Закрытие chromium под нагрузкой машины занимает до 30 с — запас на хук.
afterAll(async () => {
  await shared?.close();
  shared = null;
}, 90_000);

/** Подложки всех карточек страницы (computed background-color). */
async function cardBackgrounds(theme: Theme, style: Style, html: string): Promise<string[]> {
  const tokensCss = buildTokensCss({ colorSchemes: SCHEMES, productCardStyle: style }, theme);
  const ctx = await (await browser()).newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await ctx.newPage();
  await page.route("**/*", (route) =>
    /^(data:|about:)/.test(route.request().url()) ? route.continue() : route.abort(),
  );
  try {
    await page.setContent(
      pageHtml({ theme, blocks: [{ block: "PopularProducts", html: stripScripts(html) }], tokensCss, schemeId: SECTION_SCHEME }),
      { waitUntil: "domcontentloaded" },
    );
    return await page.$$eval('[data-nt$="-product-card"]', (els) =>
      els.map((el) => getComputedStyle(el).backgroundColor),
    );
  } finally {
    await ctx.close();
  }
}

describe("«Карточки товара → Стиль» в секции со своей схемой", () => {
  describe.each(THEMES)("%s", (theme) => {
    const paths = cardPaths(theme);

    it("есть что мерить: SSR с товарами и заглушки отрисованы", () => {
      expect(paths.map(([name]) => name)).toEqual(
        expect.arrayContaining(["SSR с товарами", "SSR-заглушки"]),
      );
    });

    describe.each(["standard", "card"] as const)("стиль %s", (style) => {
      it.each(paths)("%s", async (_name, html) => {
        const got = await cardBackgrounds(theme, style, html);
        expect(got.length).toBeGreaterThan(0);
        expect(got.filter((bg) => bg !== EXPECTED[style])).toEqual([]);
      }, 120_000);
    });
  });
});

describe("саботаж: замер видит плашку утилитой", () => {
  it("корень карточки с bg-[#FBFBFB] при «Стандарте» — ловится", async () => {
    const html = `<section class="color-scheme-3"><article data-nt="flux-product-card" class="bg-[#FBFBFB] p-3">x</article></section>`;
    const got = await cardBackgrounds("flux", "standard", html);
    expect(got).toEqual(["rgb(251, 251, 251)"]);
  }, 120_000);
});
