/**
 * Числа владельца для размеров по умолчанию (25.09).
 *
 * Владелец, про rose: полоса объявлений на телефоне — «11–13», заголовки
 * «Коллекций» и «Галереи» — «14–16». Принцип: «ориентируемся на конструктор,
 * чтобы не рушились настройки и значения в параметрах секции». Поэтому числа
 * отдаёт ЗНАЧЕНИЕ ПО УМОЛЧАНИЮ поля панели (не отдельная ветка «не задано»),
 * а соседние варианты масштабируются пропорционально — порядок размеров
 * сторожит panel-size-order.spec.ts.
 *
 * Мерим кегль в браузере (тот же CSS темы и токены, что у витрины), с
 * признаком «как у верстальщиков» и без: на проде признак у всех сайтов.
 *
 * Требует сборки: pnpm build, pnpm build:blocks, pnpm build:theme-sections:all.
 */
import { chromium, type Browser } from "playwright";

import { renderSections, themeCss, tokensCssFor } from "../../../scripts/qa/lib";

type Expect = { width: number; min: number; max: number };
type Target = {
  name: string;
  block: string;
  props: Record<string, unknown>;
  /** CSS-селектор узла, чей кегль меряем. */
  node: string;
  expect: Expect[];
};

const TARGETS: Target[] = [
  {
    name: "rose «Панель объявлений»: «Большой» по умолчанию — 11–13px на телефоне, 16px на компьютере",
    block: "PromoBanner",
    props: { id: "PromoBanner-1", text: "Бесплатная доставка от 5000 ₽" },
    node: "p",
    expect: [
      { width: 360, min: 11, max: 13 },
      { width: 390, min: 11, max: 13 },
      { width: 1440, min: 16, max: 16 },
    ],
  },
  {
    name: "rose «Список коллекций»: заголовок по умолчанию — 14 телефон, 16 планшет, 20 компьютер",
    block: "Collections",
    props: { id: "Collections-1", heading: "Коллекции" },
    node: "h2",
    expect: [
      { width: 375, min: 14, max: 14 },
      { width: 800, min: 16, max: 16 },
      { width: 1440, min: 20, max: 20 },
    ],
  },
  {
    name: "rose «Галерея»: заголовок по умолчанию — 14–16 на телефоне и планшете, 20 компьютер",
    block: "Gallery",
    props: { id: "Gallery-1", heading: "Наши коллекции", text: "Подзаголовок галереи" },
    node: "h2",
    expect: [
      { width: 375, min: 14, max: 15 },
      { width: 800, min: 16, max: 16 },
      { width: 1440, min: 20, max: 20 },
    ],
  },
];

const MODES = [
  { name: "без признака", extra: {} },
  { name: "с признаком", extra: { __designParity: true } },
] as const;

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

async function fontSizeAt(html: string, node: string, width: number): Promise<number> {
  const head = `<meta charset="utf-8"><style>${themeCss("rose")}</style><style id="__merfy_tokens_css">${tokensCssFor("rose")}</style>`;
  const ctx = await (await browser()).newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await page.route("**/*", (route) =>
    /^(data:|about:)/.test(route.request().url()) ? route.continue() : route.abort(),
  );
  try {
    await page.setContent(`<!doctype html><html lang="ru"><head>${head}</head><body>${stripScripts(html)}</body></html>`, {
      waitUntil: "domcontentloaded",
    });
    return await page.evaluate(
      (sel) => parseFloat(getComputedStyle(document.querySelector(sel) as Element).fontSize),
      node,
    );
  } finally {
    await ctx.close();
  }
}

describe.each(MODES)("числа владельца по умолчанию — $name", ({ extra }) => {
  it.each(TARGETS)("$name", async ({ block, props, node, expect: points }) => {
    const [row] = renderSections("rose", [{ block, props: { ...props, ...extra } }]);
    if (!row?.html) throw new Error(`${block}: ${row?.error ?? "нет html"}`);
    const got = await Promise.all(points.map((p) => fontSizeAt(row.html as string, node, p.width)));
    const bad = points
      .map((p, i) => ({ ...p, got: got[i] }))
      .filter((p) => p.got < p.min - 0.01 || p.got > p.max + 0.01)
      .map((p) => `${p.width}px: ${p.got}px, ждали ${p.min}–${p.max}px`);
    expect(bad).toEqual([]);
  }, 60_000);
});
