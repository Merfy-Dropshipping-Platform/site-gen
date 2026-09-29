/**
 * Длинное название товара не распирает страницу на телефоне. Пять тем,
 * «Популярные товары» главной с карточками клиентской дорисовки
 * (renderCardHtml темы — ей «Коллекция товаров» рисует витрину), 390 px.
 *
 * Баг 28.09 (flux, магазин MrMerfy, 390 px): страница 461 px, справа белая
 * полоса. Причина: правило «Выравнивание» карточки
 * `[data-nt="flux-product-card"] > div:last-child { align-items: … !important }`
 * снимает stretch, и блок текста получает ширину по содержимому, а название с
 * `truncate` (nowrap) — это вся строка. Обрезки нет, блок шире карточки.
 * Замер до правки с названием в 84 знака: flux 857 px, rose/bloom/satin/vanilla
 * 390. Правка — потолок 100% потомкам текст-блока (themes/flux global.css).
 *
 * САБОТАЖ: снять правило `> div:last-child > * { max-width: 100% }` у flux —
 * тест краснеет на flux.
 *
 * Требует сборки: pnpm build, pnpm build:blocks, pnpm build:theme-sections:all.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { chromium, type Browser } from "playwright";

import { buildTokensCss, themeSchemeToMerchantShape } from "../tokens-css";
import { renderSections } from "../../../scripts/qa/lib/render";
import { themeCss } from "../../../scripts/qa/lib/tailwind-css";

const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
type Theme = (typeof THEMES)[number];
const ROOT = resolve(__dirname, "..", "..", "..");
const WIDTH = 390;

const LONG =
  "Беспроводные полноразмерные наушники с активным шумоподавлением и длинным названием";
const product = (id: string) => ({
  id,
  name: `${LONG} ${id}`,
  title: `${LONG} ${id}`,
  slug: id,
  handle: id,
  price: 129990,
  basePrice: 129990,
  compareAtPrice: null,
  image: `/${id}.jpg`,
  images: [`/${id}.jpg`],
  hasVariants: false,
  variantCombinations: [],
  variantGroups: [],
  collectionIds: ["col-1"],
});
const PRODUCTS = ["p-1", "p-2", "p-3", "p-4"].map(product);

const strip = (html: string): string =>
  html.replace(/<script\b[\s\S]*?<\/script>/gi, "");

function sectionPage(theme: Theme): string {
  const manifest = JSON.parse(
    readFileSync(resolve(ROOT, `packages/theme-${theme}/theme.json`), "utf8"),
  );
  const schemes = (manifest.colorSchemes as unknown[]).map((s) =>
    themeSchemeToMerchantShape(s as never),
  );
  const home = JSON.parse(
    readFileSync(
      resolve(ROOT, `packages/theme-${theme}/pages/home.json`),
      "utf8",
    ),
  );
  const popular = (
    home.content as Array<{ type: string; props: Record<string, unknown> }>
  ).find((b) => b.type === "PopularProducts");
  if (!popular)
    throw new Error(`${theme}: на главной нет «Популярных товаров»`);
  const [row] = renderSections(theme, [
    { block: "PopularProducts", props: popular.props },
  ]);
  if (!row?.html)
    throw new Error(
      `${theme}: секция не отрисовалась: ${row?.error ?? "нет HTML"}`,
    );
  const scheme = popular.props.colorScheme
    ? String(popular.props.colorScheme).replace("scheme-", "")
    : null;
  const body = scheme
    ? `<div class="color-scheme-${scheme}">${strip(row.html)}</div>`
    : strip(row.html);
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<style>${themeCss(theme)}</style>
<style id="__merfy_tokens_css">${buildTokensCss({ colorSchemes: schemes }, theme)}</style>
</head><body><main>${body}</main></body></html>`;
}

function hydratedCards(theme: Theme): string {
  const path = resolve(
    ROOT,
    "themes",
    theme,
    "src",
    "lib",
    "storefront-hydrate.ts",
  );
  // Порт темы — TS-модуль; jest грузит его через require (как product-card-style-follows-setting).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { renderCardHtml } = require(path) as {
    renderCardHtml: (p: unknown) => string;
  };
  return PRODUCTS.map((p) => `<li>${renderCardHtml(p)}</li>`).join("");
}

let shared: Browser | null = null;
async function browser(): Promise<Browser> {
  shared ??= await chromium
    .launch()
    .catch(() => chromium.launch({ channel: "chrome" }));
  return shared;
}
afterAll(async () => {
  await shared?.close();
  shared = null;
}, 90_000);

describe("длинное название товара не распирает страницу на 390 px", () => {
  it.each(THEMES)(
    "%s: ширина страницы = ширине экрана, название внутри карточки",
    async (theme) => {
      const ctx = await (
        await browser()
      ).newContext({ viewport: { width: WIDTH, height: 900 } });
      const page = await ctx.newPage();
      await page.route("**/*", (route) =>
        /^(data:|about:)/.test(route.request().url())
          ? route.continue()
          : route.abort(),
      );
      try {
        await page.setContent(sectionPage(theme), {
          waitUntil: "domcontentloaded",
        });
        const m = await page.evaluate((cards) => {
          const lists = new Set<Element>();
          document
            .querySelectorAll('[data-nt$="-product-card"]')
            .forEach((c) => {
              const ul = c.closest("ul");
              if (ul) lists.add(ul);
            });
          lists.forEach((ul) => {
            ul.innerHTML = cards;
          });
          const cardEls = [
            ...document.querySelectorAll('[data-nt$="-product-card"]'),
          ];
          const sticking = cardEls.filter((card) => {
            const edge = card.getBoundingClientRect().right + 0.5;
            return [...card.querySelectorAll("*")].some(
              (el) => el.getBoundingClientRect().right > edge,
            );
          }).length;
          return {
            lists: lists.size,
            cards: cardEls.length,
            sticking,
            scrollWidth: document.documentElement.scrollWidth,
          };
        }, hydratedCards(theme));
        expect(m.cards).toBeGreaterThan(0);
        expect({ theme, ширина: m.scrollWidth, торчат: m.sticking }).toEqual({
          theme,
          ширина: WIDTH,
          торчат: 0,
        });
      } finally {
        await ctx.close();
      }
    },
    120_000,
  );
});
