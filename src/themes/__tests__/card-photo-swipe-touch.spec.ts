/**
 * «Следующее фото» на телефоне — касаниями пальца в настоящем браузере.
 *
 * Владелец: «сейчас не работает вообще… везде надо проверить, это touch
 * события… скроллится оно или не скроллится». Первый сторож
 * (card-photo-swipe.spec.ts) слал события касания прямо в картинку в jsdom —
 * мимо того, что делает телефон: попадания пальцем по точке и решения браузера,
 * чей это жест. Когда страница может прокрутиться вбок (что-то вылезло за край
 * экрана — на телефонах это обычное дело) или у браузера свой жест на свайп
 * («назад»), браузер забирает горизонтальный жест себе, касание отменяется, и
 * фото не листается. Замер «до» этого сторожа: на странице шире экрана rose,
 * satin и flux не листали фото ни в «Группе товаров», ни в «Коллекции товаров».
 * Лечение — `touch-action: pan-y` на фото (runtime/card-photo-swipe.ts).
 *
 * Свайп не зависит от «Следующего фото при наведении» (владелец: «чтобы свайпы
 * работали», без условий), поэтому секции здесь — с ВЫКЛЮЧЕННОЙ настройкой:
 * листать должно и так. Наведение мышью без настройки выключено — это сторожит
 * catalog-next-photo-by-theme.spec.ts.
 *
 * Здесь всё как у покупателя: секция темы нарисована тем же рендером, что
 * витрина, со стилями темы и товарами на три фото; Chromium в режиме телефона;
 * палец — касаниями по координатам (протокол браузера). На каждый случай:
 *   • горизонтальный свайп и свайп дугой листают фото, страница стоит;
 *   • вертикальный свайп прокручивает страницу и фото не трогает;
 *   • тап доходит до карточки (свайп его не глотает).
 *
 * Требует сборки: pnpm build, pnpm build:blocks, pnpm build:theme-sections:all.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { chromium, type Browser, type Page } from "playwright";

import { renderSections, themeCss, tokensCssFor } from "../../../scripts/qa/lib";
import { BLOCK_ROOT_INLINE } from "../../common/block-root-inline";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "vanilla", "satin", "bloom", "flux"] as const;
const BLOCKS = ["Catalog", "PopularProducts"] as const;
const ORIGIN = "http://merfy.test";
const PHOTOS = ["/img/a.svg", "/img/b.svg", "/img/c.svg"];
const COLOR: Record<string, string> = { a: "#e33", b: "#3a3", c: "#33e" };

/** Рантайм свайпа — ровно тот модуль, что подключает страница темы. */
const esbuild = require(require.resolve("esbuild", { paths: [dirname(require.resolve("astro/package.json"))] }));
const SWIPE_JS =
  esbuild.transformSync(readFileSync(resolve(SITES_ROOT, "packages/theme-base/runtime/card-photo-swipe.ts"), "utf8"), {
    loader: "ts",
    format: "iife",
    globalName: "__swipe",
  }).code + ";__swipe.initCardPhotoSwipe();";

const product = (i: number) => ({
  id: `p-${i}`,
  name: `Товар ${i}`,
  title: `Товар ${i}`,
  slug: `p-${i}`,
  handle: `p-${i}`,
  price: 1000,
  basePrice: 1000,
  compareAtPrice: null,
  image: PHOTOS[0],
  images: PHOTOS,
  hasVariants: false,
  variantCombinations: [],
  variantGroups: [],
  collectionIds: ["col-1"],
});
const PRODUCTS = [1, 2, 3, 4].map(product);
const COLLECTIONS = [{ id: "col-1", name: "Хиты", slug: "hity", image: "", productIds: PRODUCTS.map((p) => p.id) }];
const CATALOG = { collections: COLLECTIONS, products: PRODUCTS, publications: [] };
const API: [RegExp, unknown][] = [
  [/\/api\/store\/products/, { products: PRODUCTS, data: PRODUCTS, total: 4, pagination: { page: 1, limit: 12, total: 4, totalPages: 1 } }],
  [/\/api\/store\/filters/, { success: true, data: { groups: [] } }],
  [/\/api\/store\/collections/, { collections: COLLECTIONS, total: 1 }],
  [/products\.json/, PRODUCTS],
  [/storefront-data/, { products: PRODUCTS, collections: COLLECTIONS }],
];
const PROPS: Record<(typeof BLOCKS)[number], Record<string, unknown>> = {
  Catalog: {
    id: "Catalog-1",
    siteId: "site-1",
    colorScheme: "scheme-1",
    cards: 8,
    columns: 2,
    showFilter: "false",
    showSort: "false",
    productCard: { quickAdd: "none", nextPhoto: "false" },
  },
  PopularProducts: { id: "Pop-1", colorScheme: "scheme-1", cards: 4, columns: 2, collection: "col-1", nextPhotoOnHover: false },
};
/** Фото, которое листается, в каждой секции (первое видимое берём в браузере). */
const PHOTO: Record<(typeof BLOCKS)[number], string> = {
  Catalog: '[data-nt="catalog-grid"] img[data-img-2], [data-nt="catalog-grid"] img[data-img-secondary]',
  PopularProducts: '[data-nt="popular-grid"] li[data-image-2] img',
};
/** У vanilla и flux ячейки «Коллекции товаров» дорисовывает модульный скрипт — повторяем его вывод. */
const HYDRATED_BY_MODULE = new Set(["vanilla", "flux"]);

type Variant = { name: string; wide: boolean; lockOff?: boolean };
const NORMAL: Variant = { name: "обычная страница", wide: false };
const WIDE: Variant = { name: "страница шире экрана", wide: true };

function pageHtml(theme: string, block: (typeof BLOCKS)[number], v: Variant): string {
  const [r] = renderSections(theme, [{ block, props: PROPS[block], catalog: CATALOG }]);
  if (r.error) throw new Error(`${theme}/${block}: ${r.error}`);
  const unlock = v.lockOff ? `<style>${PHOTO[block]}{touch-action:auto!important}</style>` : "";
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${themeCss(theme)}</style><style id="__merfy_tokens_css">${tokensCssFor(theme)}</style>
<script>${BLOCK_ROOT_INLINE.replace(/^<script>|<\/script>$/g, "")}</script></head>
<body style="margin:0"><div style="height:200px${v.wide ? ";width:1400px" : ""}"></div>${r.html ?? ""}<div style="height:1600px"></div>
<script>${SWIPE_JS}</script>${unlock}</body></html>`;
}

let shared: Browser | null = null;
async function browser(): Promise<Browser> {
  shared = shared ?? (await chromium.launch().catch(() => chromium.launch({ channel: "chrome" })));
  return shared;
}
afterAll(async () => {
  await shared?.close();
  shared = null;
});

type Stand = { page: Page; close: () => Promise<void> };

async function stand(theme: string, block: (typeof BLOCKS)[number], v: Variant): Promise<Stand> {
  const html = pageHtml(theme, block, v);
  const ctx = await (await browser()).newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN && url.pathname === "/page") return route.fulfill({ contentType: "text/html", body: html });
    const img = /^\/img\/(\w)\.svg$/.exec(url.pathname);
    if (img)
      return route.fulfill({
        contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="${COLOR[img[1]] ?? "#999"}"/></svg>`,
      });
    const api = API.find(([re]) => re.test(url.pathname + url.search));
    if (api) return route.fulfill({ contentType: "application/json", body: JSON.stringify(api[1]) });
    return route.abort();
  });
  await page.goto(`${ORIGIN}/page`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  if (block === "PopularProducts" && HYDRATED_BY_MODULE.has(theme)) {
    const { renderCardHtml } = require(`../../../themes/${theme}/src/lib/storefront-hydrate`) as { renderCardHtml: (p: unknown) => string };
    const cells = PRODUCTS.map((p) => `<li data-product-id="${p.id}" data-image-2="${p.images[1]}">${renderCardHtml(p)}</li>`).join("");
    await page.evaluate((markup) => {
      const grid = document.querySelector('[data-nt="popular-grid"]');
      if (grid) grid.innerHTML = markup;
    }, cells);
  }
  // Клики внутри карточки: дошли ли они (свайп не глотает тап). Переход по
  // ссылке отменяем, чтобы страница осталась на месте.
  await page.evaluate(() => {
    const w = window as unknown as { __clicks: boolean[] };
    w.__clicks = [];
    document.addEventListener(
      "click",
      (event) => {
        const inCard = (event.target as Element | null)?.closest?.("li, article, [data-nt$='-product-card']");
        if (!inCard) return;
        w.__clicks.push(event.defaultPrevented);
        if ((event.target as Element).closest("a[href]")) event.preventDefault();
      },
      true,
    );
  });
  return { page, close: () => ctx.close() };
}

type State = { src: string; x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };

async function photo(page: Page, block: (typeof BLOCKS)[number]) {
  const handle = await page.evaluateHandle(
    (sel) => [...document.querySelectorAll<HTMLElement>(sel)].find((el) => el.getBoundingClientRect().width > 0) ?? null,
    PHOTO[block],
  );
  const el = handle.asElement();
  if (!el) throw new Error(`нет фото со следующим фото (${block})`);
  /** Первое фото, карточка — в середине экрана, страница у левого края, инерция прокрутки остановлена. */
  const reset = async () => {
    await el.evaluate((img) => {
      const first = img.getAttribute("data-img-primary") || img.getAttribute("data-image-1") || img.getAttribute("src");
      if (first) img.setAttribute("src", first);
      img
        .closest("li")
        ?.querySelectorAll("source")
        .forEach((s) => s.setAttribute("srcset", s.getAttribute("data-srcset-1") || s.getAttribute("srcset") || ""));
      // Мгновенно: у тем плавная прокрутка, и замер «до» попадал бы в её хвост.
      window.scrollTo({ left: 0, top: Math.round(img.getBoundingClientRect().top + window.scrollY - 250), behavior: "instant" });
    });
    await page.waitForTimeout(200);
  };
  const state = async (): Promise<State> =>
    el.evaluate((img) => ({ src: img.getAttribute("src") ?? "", x: Math.round(window.scrollX), y: Math.round(window.scrollY) }));
  const box = async () => (await el.boundingBox())!;
  return { el, reset, state, box };
}

async function touch(page: Page, points: { x: number; y: number }[]) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [points[0]] });
  for (const p of points.slice(1)) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [p] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(350);
  await cdp.detach();
}
const path = (x0: number, y0: number, x1: number, y1: number, steps = 10) =>
  Array.from({ length: steps + 1 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }));

/** Свайп влево через фото: следующее фото. */
const swipeLeft = (b: Box) => path(b.x + b.width * 0.85, b.y + b.height / 2, b.x + b.width * 0.15, b.y + b.height / 2 + 4);
/** Свайп дугой: палец уходит вбок и немного вниз, как большим пальцем одной руки. */
const swipeArc = (b: Box) => path(b.x + b.width * 0.85, b.y + b.height * 0.3, b.x + b.width * 0.85 - 120, b.y + b.height * 0.3 + 40);
/** Прокрутка ленты: палец ведёт по фото вверх. */
const swipeUp = (b: Box) => path(b.x + b.width / 2, b.y + b.height * 0.8, b.x + b.width / 2 + 6, b.y + b.height * 0.8 - 250);

describe.each(THEMES)("«Следующее фото» пальцем — %s", (theme) => {
  describe.each(BLOCKS)("%s", (block) => {
    it.each([NORMAL, WIDE])("$name: свайп вбок и дугой листает фото и не двигает страницу", async (v) => {
      const s = await stand(theme, block, v);
      try {
        const { el, reset, state, box } = await photo(s.page, block);
        const moved = async (gesture: (b: Box) => { x: number; y: number }[]) => {
          await reset();
          const before = await state();
          await touch(s.page, gesture(await box()));
          const after = await state();
          return { фото: after.src !== before.src, вбок: after.x - before.x, вниз: after.y - before.y };
        };
        expect({
          жестФото: await el.evaluate((img) => getComputedStyle(img).touchAction),
          прямо: await moved(swipeLeft),
          дугой: await moved(swipeArc),
        }).toEqual({
          жестФото: "pan-y",
          прямо: { фото: true, вбок: 0, вниз: 0 },
          дугой: { фото: true, вбок: 0, вниз: 0 },
        });
      } finally {
        await s.close();
      }
    }, 120_000);

    it("обычная страница: свайп вверх прокручивает страницу и фото не трогает, тап доходит до карточки", async () => {
      const s = await stand(theme, block, NORMAL);
      try {
        const { reset, state, box } = await photo(s.page, block);
        await reset();
        const before = await state();
        await touch(s.page, swipeUp(await box()));
        const after = await state();
        await reset();
        await s.page.evaluate(() => ((window as unknown as { __clicks: boolean[] }).__clicks = []));
        const b = await box();
        await touch(s.page, [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }]);
        const clicks = await s.page.evaluate(() => (window as unknown as { __clicks: boolean[] }).__clicks);
        expect({ фото: after.src === before.src, прокрутка: after.y - before.y > 50, тапДошёл: clicks.includes(false) }).toEqual({
          фото: true,
          прокрутка: true,
          тапДошёл: true,
        });
      } finally {
        await s.close();
      }
    }, 120_000);
  });
});

describe("саботаж: без закрепления жеста фото на широкой странице не листается", () => {
  it("rose, «Группа товаров»", async () => {
    const s = await stand("rose", "Catalog", { ...WIDE, lockOff: true });
    try {
      const { reset, state, box } = await photo(s.page, "Catalog");
      await reset();
      const before = await state();
      await touch(s.page, swipeLeft(await box()));
      expect((await state()).src).toBe(before.src);
    } finally {
      await s.close();
    }
  }, 120_000);
});
