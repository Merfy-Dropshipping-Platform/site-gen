/**
 * «Галерея»: низ большой плитки сходится с низом соседней колонки — замер в
 * браузере, а не разбор классов.
 *
 * Решение владельца (баг-репорт по bloom, подтверждено «выравниваем» 25.09):
 * когда плитки стоят рядом, нижние края большой плитки и боковой колонки на
 * одной линии, без дыры. Прежний сторож (media-section-column-parity) проверял
 * СПОСОБ — «большая плитка тянется по высоте строки, пропорция на lg снята».
 * У верстальщиков (режим «как у верстальщиков», на проде у всех) большая
 * плитка — квадрат, и выравнивают боковые плитки; разбор классов этого не
 * различал: краснел там, где низы сходятся, и молчал о дыре rose с двумя
 * плитками (до 375px на 1440). Поэтому мерим РЕЗУЛЬТАТ.
 *
 * Рисуем тем же модулем темы, что витрина (renderSections), CSS темы и токены —
 * как в owner-default-sizes. Оба режима: как на проде и прежняя ветка.
 *
 * Требует сборки: pnpm build, pnpm build:blocks, pnpm build:theme-sections:all.
 */
import { chromium, type Browser } from "playwright";

import { renderSections, themeCss, tokensCssFor } from "../../../scripts/qa/lib";

const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
const WIDTHS = [768, 1024, 1470, 1920] as const;
const MODES = [
  { name: "как на проде", extra: {} },
  { name: "прежняя ветка", extra: { __designParity: false } },
] as const;

const IMAGES = [1, 2, 3].map((i) => ({
  id: `i${i}`,
  type: "image",
  url: "/placeholders/landscape-gallery.png",
  alt: `Изображение ${i}`,
}));
const CANON = [
  { id: "c1", type: "image", url: "", alt: "Изображение" },
  { id: "c2", type: "product", productId: null },
  { id: "c3", type: "collection", collectionId: null },
];
const SETS: [string, unknown[]][] = [
  ["изображение + товар + коллекция", CANON],
  ["три изображения", IMAGES],
  ["две плитки", IMAGES.slice(0, 2)],
];

/** Допуск на округление субпикселей. */
const TOLERANCE_PX = 2;

let shared: Browser | null = null;
async function browser(): Promise<Browser> {
  if (shared) return shared;
  shared = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
  return shared;
}
afterAll(async () => {
  await shared?.close();
  shared = null;
});

const stripScripts = (html: string): string => html.replace(/<script\b[\s\S]*?<\/script>/gi, "");

type Probe = { beside: boolean; heroBottom: number; sideBottom: number } | null;

/** Исполняется В БРАУЗЕРЕ: стоят ли плитки рядом и где их нижние края. */
function probe(): Probe {
  const tiles = Array.from(
    document.querySelectorAll('[data-puck-subsection-field="items"]'),
  ) as HTMLElement[];
  if (tiles.length < 2) return null;
  const hero = tiles[0].getBoundingClientRect();
  const side = tiles.slice(1).map((t) => t.getBoundingClientRect());
  const beside = side.every((r) => r.top < hero.bottom - 1 && (r.left >= hero.right - 1 || r.right <= hero.left + 1));
  return {
    beside,
    heroBottom: Math.round(hero.bottom),
    sideBottom: Math.round(Math.max(...side.map((r) => r.bottom))),
  };
}

async function measure(theme: string, html: string): Promise<{ width: number; p: Probe }[]> {
  const head = `<meta charset="utf-8"><style>${themeCss(theme)}</style><style id="__merfy_tokens_css">${tokensCssFor(theme)}</style>`;
  const ctx = await (await browser()).newContext({ viewport: { width: WIDTHS[0], height: 1600 } });
  const page = await ctx.newPage();
  await page.route("**/*", (route) =>
    /^(data:|about:)/.test(route.request().url()) ? route.continue() : route.abort(),
  );
  try {
    await page.setContent(
      `<!doctype html><html lang="ru"><head>${head}</head><body>${stripScripts(html)}</body></html>`,
      { waitUntil: "domcontentloaded" },
    );
    const out: { width: number; p: Probe }[] = [];
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 1600 });
      out.push({ width, p: await page.evaluate(probe) });
    }
    return out;
  } finally {
    await ctx.close();
  }
}

describe.each(MODES)("«Галерея»: низы колонок сходятся — $name", ({ extra }) => {
  describe.each(THEMES)("%s", (theme) => {
    it.each(SETS)("%s", async (_name, items) => {
      const [row] = renderSections(theme, [
        { block: "Gallery", props: { id: "Gallery-1", colorScheme: "scheme-3", items, ...extra } },
      ]);
      if (!row?.html) throw new Error(`${theme}: ${row?.error ?? "нет html"}`);
      const got = await measure(theme, row.html);
      const holes = got
        .filter(({ p }) => p?.beside)
        .map(({ width, p }) => ({ width, diff: (p as NonNullable<Probe>).heroBottom - (p as NonNullable<Probe>).sideBottom }))
        .filter(({ diff }) => Math.abs(diff) > TOLERANCE_PX)
        .map(({ width, diff }) => `${width}px: разбег низов ${diff}px`);
      expect(holes).toEqual([]);
    }, 120_000);
  });
});

describe("саботаж: замер видит дыру", () => {
  it("низ боковой колонки выше низа большой плитки — ловится", async () => {
    const html = `<div style="display:grid;grid-template-columns:1fr 200px;align-items:start;gap:16px">
      <div data-puck-subsection-field="items" style="height:400px"></div>
      <div><div data-puck-subsection-field="items" style="height:250px"></div></div></div>`;
    const ctx = await (await browser()).newContext({ viewport: { width: 1024, height: 900 } });
    const page = await ctx.newPage();
    await page.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`);
    const p = await page.evaluate(probe);
    await ctx.close();
    expect(p?.beside).toBe(true);
    expect(Math.abs((p?.heroBottom ?? 0) - (p?.sideBottom ?? 0))).toBeGreaterThan(TOLERANCE_PX);
  });
});
