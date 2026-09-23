/**
 * Отступы секций и зазоры между ними — в цвет СВОЕЙ схемы. Замер глазами браузера.
 *
 * Владелец 23.09, два бага:
 *  1) «Отступы между секций во всех вкладках и страницах берут на себя фон
 *     цветовой схемы 1 в независимости какая выбрана у секций» — слайдер темы
 *     «Страница → Отступы: между секций» (токен `--section-gap`);
 *  2) «Отступы секций Коллекции: должна применяться цв схема для отступов
 *     секции, в которой выставляются данные настройки отступов» — «Каталог»
 *     на страницах коллекции и каталога.
 *
 * Как меряем. Живые порты тем (та же лестница, что у витрины), пропы — стартовые
 * пропы панели из того же puck-config, что отдаёт прод, РЕАЛЬНЫЙ CSS темы и
 * tokens.css из buildTokensCss, обёртки схем дословно как v2-page-composer. Фон
 * страницы ядовитый rgb(1,2,3): просвет виден числом. Столбец пикселей у левого
 * края (x=4) со снимка экрана сравниваем с фоном схемы, выбранной у секции.
 *
 * Запуск (после pnpm build, build:blocks, build:theme-sections:all):
 *   pnpm qa:section-gaps                                 — правила, код 1 при нарушении
 *   pnpm tsx scripts/qa/measure-section-gaps.ts          — таблица по всем секциям
 *   … --theme=flux --width=375                           — одна тема / ширина
 */
import { chromium, type Browser, type Page } from "playwright";
import { PNG } from "pngjs";

import { buildTokensCss } from "../../src/themes/tokens-css";
import { loadRuntimePuckConfig } from "../../src/themes/conformance/load-puck-config";
import { renderSections } from "./lib/render";
import { loadTesterSchemes, schemeValue } from "./lib/schemes";
import { themeCss } from "./lib/tailwind-css";

export const THEMES = ["rose", "bloom", "flux", "satin", "vanilla"] as const;
const WIDTHS = [1280, 375] as const;
const PAD = 96;
const GAP = 48;
const POISON = "rgb(1, 2, 3)";

/** Секции страницы, у которых в панели есть «Отступы». Хром и корзина — вне замера. */
const NOT_BODY = new Set([
  "Header", "Footer", "PromoBanner",
  // Корзина и чекаут живут на своей поверхности: чекаут всегда светлый
  // (CHECKOUT_SCHEME_CSS), схема секции там не действует по замыслу.
  "CartBody", "CartSummary", "CartSection", "CartDrawer",
  "CheckoutForm", "CheckoutSummary", "CheckoutLayout", "OrderConfirmation", "AccountLayout",
]);

type Row = {
  theme: string;
  width: number;
  case: string;
  /** Полоски, где вместо фона схемы нарисовано другое. */
  wrongPx: number;
  /** Из них — ядовитый фон страницы (просвет). */
  poisonPx: number;
  /** Где: первые/последние неверные полоски от верха/низа участка. */
  where: string;
  note?: string;
};

/** Схема, чей фон отличается от фона Схемы 1, — иначе подмену не увидеть. */
function contrastScheme(tokens: string): string {
  const bg1 = schemeValue(tokens, 1, "--color-bg");
  for (const n of ["3", "2", "4", "5", "6"]) {
    const bg = schemeValue(tokens, n, "--color-bg");
    if (bg && bg !== bg1) return n;
  }
  throw new Error("нет схемы с фоном, отличным от Схемы 1");
}

/** Обёртка схемы ДОСЛОВНО как у v2-page-composer для секции со схемой. */
const wrap = (html: string, scheme: string) =>
  `<div class="color-scheme-${scheme}" data-block-scheme="${scheme}">${html}</div>`;

function page(theme: string, tokens: string, main: string): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${themeCss(theme)}</style>
<style id="__merfy_tokens_css">${tokens}</style>
<style>html,body{margin:0;padding:0;background:${POISON}}html{scroll-behavior:auto!important}html,body{overflow:visible!important;height:auto!important}</style>
</head><body><div data-above-main style="height:8px;background:rgb(9,9,9)"></div><main>${main}</main></body></html>`;
}

/**
 * Страница из строки. `addInitScript` при setContent не срабатывает, а tsx
 * вставляет в функции-аргументы evaluate вызов `__name` — задаём его сами.
 */
async function openPage(browser: Browser, html: string, width: number) {
  // «Уменьшить движение»: у тем секции с [data-animate] прозрачны, пока скрипт
  // не проявит их при прокрутке, — меряем устоявшийся вид, а не кадр до показа.
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  const pg = await ctx.newPage();
  await pg.setContent(html, { waitUntil: "load" });
  await pg.evaluate("globalThis.__name = globalThis.__name || function (f) { return f; };");
  await pg.waitForTimeout(150);
  return { ctx, pg };
}

/**
 * Цвета столбца пикселей x=4 на отрезке [y0, y1) документа. Снимаем кусками в
 * пределах окна с прокруткой: снимок fullPage растягивает окно на всю страницу,
 * и секции с размерами в vh перестраиваются — строки уезжают. Координаты clip
 * без fullPage отсчитываются от окна (проверено: после прокрутки на 1000 clip
 * y=10 даёт пиксель документа 1010).
 */
async function columnColors(pg: Page, y0: number, y1: number): Promise<string[]> {
  const CHUNK = 600;
  const out: string[] = [];
  for (let y = y0; y < y1; ) {
    // У низа документа окно дальше не едет: кусок не выше, чем осталось места
    // в окне после ФАКТИЧЕСКОЙ прокрутки (иначе clip вылезает за снимок).
    const view = await pg.evaluate((top) => {
      window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
      return { scrollY: window.scrollY, height: window.innerHeight };
    }, Math.max(0, y - 100));
    const top = y - view.scrollY;
    const h = Math.min(CHUNK, y1 - y, view.height - top);
    if (h <= 0) {
      const doc = await pg.evaluate(() => `документ ${document.documentElement.scrollHeight}px, окно ${window.innerHeight}px`);
      throw new Error(`строка ${y} вне окна после прокрутки на ${view.scrollY} (${doc})`);
    }
    const png = PNG.sync.read(await pg.screenshot({ clip: { x: 4, y: top, width: 1, height: h } }));
    for (let row = 0; row < png.height; row++) {
      const i = row * png.width * 4;
      out.push(`rgb(${png.data[i]}, ${png.data[i + 1]}, ${png.data[i + 2]})`);
    }
    y += h;
  }
  return out;
}

/**
 * Цвет полосок участка вдоль левого края — по ПИКСЕЛЯМ снимка экрана, а не по
 * свойствам DOM: так видно то же, что видит человек (градиент, псевдоэлемент,
 * тень). DOM-замер это уже подводил: полосу, закрашенную градиентом, он считал
 * просветом страницы.
 */
async function scanStrip(
  browser: Browser,
  html: string,
  width: number,
  /** Участок: вся обёртка `sel` или полоса от низа `above` до верха секции внутри `sel`. */
  target: { sel: string; above?: string },
): Promise<{ expected: string; wrong: Array<{ y: number; c: string }>; h: number }> {
  const { ctx, pg } = await openPage(browser, html, width);
  try {
    const box = await pg.evaluate(({ sel, above }) => {
      const el = document.querySelector(sel) as HTMLElement;
      const v = getComputedStyle(el).getPropertyValue("--color-bg").trim();
      const abs = (e: Element) => {
        const b = e.getBoundingClientRect();
        return { top: b.top + scrollY, bottom: b.bottom + scrollY };
      };
      // Зазор = от низа верхней секции до верха содержимого нижней: так он один
      // и тот же и когда он полем снаружи, и когда отступом внутри обёртки.
      // Крайние строки не берём — на самой границе сглаживание.
      const y0 = Math.ceil((above ? abs(document.querySelector(above)!).bottom : abs(el).top) + 1);
      const y1 = Math.floor((above ? abs(el.firstElementChild ?? el).top : abs(el).bottom) - 1);
      return { expected: `rgb(${v.split(/[\s,]+/).join(", ")})`, y0, y1 };
    }, target);
    const h = Math.max(0, box.y1 - box.y0);
    const colors = await columnColors(pg, box.y0, box.y1);
    const wrong = colors.flatMap((c, y) => (c === box.expected ? [] : [{ y, c }]));
    return { expected: box.expected, wrong, h };
  } finally {
    await ctx.close();
  }
}

function summarize(theme: string, width: number, name: string, s: { wrong: Array<{ y: number; c: string }>; h: number }, note?: string): Row {
  const ys = s.wrong.map((w) => w.y);
  return {
    theme,
    width,
    case: name,
    wrongPx: s.wrong.length,
    poisonPx: s.wrong.filter((w) => w.c === POISON).length,
    where: ys.length ? `${Math.min(...ys)}..${Math.max(...ys)} из ${s.h}` : "",
    note,
  };
}

type PuckConfig = Awaited<ReturnType<typeof loadRuntimePuckConfig>>;
type PanelBlock = { fields?: Record<string, unknown>; defaultProps?: Record<string, unknown> };

/** Стартовые пропы секции — ровно то, что конструктор вставляет из панели. */
const panelDefaults = (cfg: PuckConfig, type: string) =>
  (cfg.components[type] as PanelBlock).defaultProps ?? {};

/** В замере отступов: секции страницы с полем «Отступы». */
const measuredTypes = (cfg: PuckConfig, only?: string) =>
  Object.keys(cfg.components).filter(
    (type) =>
      !NOT_BODY.has(type) &&
      Boolean((cfg.components[type] as PanelBlock).fields?.padding) &&
      (!only || type === only),
  );

/** Баг 2 и вся его семья: «Отступы» секции окрашены её схемой. */
async function measurePadding(browser: Browser, theme: string, only?: string): Promise<Row[]> {
  const schemes = loadTesterSchemes();
  const tokens = buildTokensCss({ colorSchemes: schemes }, theme);
  const scheme = contrastScheme(tokens);
  const cfg = await loadRuntimePuckConfig(theme);
  const rendered = renderSections(
    theme,
    measuredTypes(cfg, only).map((type) => ({
      block: type,
      props: {
        ...panelDefaults(cfg, type),
        id: `${type}-1`,
        colorScheme: `scheme-${scheme}`,
        padding: { top: PAD, bottom: PAD },
      },
    })),
  );
  const rows: Row[] = [];
  for (const width of WIDTHS) {
    for (const r of rendered) {
      if (!r.html) {
        rows.push({ theme, width, case: `отступ ${r.block}`, wrongPx: -1, poisonPx: -1, where: "", note: `секция не отрисовалась: ${r.error ?? "?"}` });
        continue;
      }
      const html = page(theme, tokens, wrap(r.html, scheme));
      try {
        const s = await scanStrip(browser, html, width, { sel: "[data-block-scheme]" });
        rows.push(summarize(theme, width, `отступ ${r.block}`, s));
      } catch (e) {
        // Сбой замера — нарушение с адресом, а не падение всего прогона.
        rows.push({ theme, width, case: `отступ ${r.block}`, wrongPx: -1, poisonPx: -1, where: "", note: `замер не удался: ${(e as Error).message.split("\n")[0]}` });
      }
    }
  }
  return rows;
}

/** Баг 1: зазор между секциями окрашен схемой нижней секции, а не фоном страницы. */
async function measureGap(browser: Browser, theme: string): Promise<Row[]> {
  const schemes = loadTesterSchemes();
  const tokens = buildTokensCss({ colorSchemes: schemes, sectionGap: GAP }, theme);
  const lower = contrastScheme(tokens);
  const cfg = await loadRuntimePuckConfig(theme);
  const props = (type: string) => ({ ...panelDefaults(cfg, type), id: `${type}-1` });
  const [a, b] = renderSections(theme, [
    { block: "MainText", props: { ...props("MainText"), colorScheme: "scheme-1" } },
    { block: "MultiColumns", props: { ...props("MultiColumns"), colorScheme: `scheme-${lower}` } },
  ]);
  if (!a.html || !b.html) throw new Error(`${theme}: рендер секций зазора не дал HTML`);
  // Порты кладут <style>/<script> прямо в <main> — первый ребёнок бывает не секцией.
  const main = `<style></style>${wrap(a.html, "1")}<script></script>${wrap(b.html, lower)}`;
  const rows: Row[] = [];
  for (const width of WIDTHS) {
    const html = page(theme, tokens, main);
    const gap = await scanStrip(browser, html, width, { sel: `[data-block-scheme="${lower}"]`, above: `[data-block-scheme="1"]` });
    rows.push(summarize(theme, width, "зазор между секциями", gap, `высота зазора ${gap.h}px`));
    // Над первой секцией зазора нет. Меряем от опорного блока перед <main>, а не
    // от верха <main>: поле первой секции схлопывается сквозь <main>, и разница
    // с его верхом всегда ноль (так проверка была слепой).
    const { ctx, pg } = await openPage(browser, html, width);
    const above = await pg.evaluate(() => {
      const anchor = document.querySelector("[data-above-main]")!.getBoundingClientRect().bottom;
      const f = document.querySelector('[data-block-scheme="1"]')!.getBoundingClientRect().top;
      return Math.round(f - anchor);
    });
    await ctx.close();
    rows.push({ theme, width, case: "над первой секцией", wrongPx: above, poisonPx: above, where: "" });
  }
  return rows;
}

export type Rule = { id: string; bug: string; title: string; applies: (r: Row) => boolean; check: (r: Row) => string | null };

export const RULES: Rule[] = [
  {
    id: "зазор-в-цвет-нижней-секции",
    bug: "1",
    title: "зазор между секциями окрашен схемой нижней секции, фон страницы не просвечивает",
    applies: (r) => r.case === "зазор между секциями",
    check: (r) => (r.wrongPx === 0 ? null : `чужой цвет ${r.wrongPx}px из ${GAP} (${r.where}), просвет страницы ${r.poisonPx}px`),
  },
  {
    id: "над-первой-секцией-нет-зазора",
    bug: "1",
    title: "зазор только МЕЖДУ секциями: над первой его нет, даже если <main> начинается со <style>",
    applies: (r) => r.case === "над первой секцией",
    check: (r) => (r.wrongPx === 0 ? null : `над первой секцией ${r.wrongPx}px`),
  },
  {
    id: "отступ-без-просвета-страницы",
    bug: "2",
    title: "«Отступы» секции со своей схемой не показывают фон страницы (в «Каталоге» и везде)",
    // Правило — по просвету: у hero и слайдов своя подложка по замыслу, а жалоба
    // владельца ровно в том, что сквозь отступ виден фон страницы (Схема 1).
    applies: (r) => r.case.startsWith("отступ "),
    check: (r) => {
      if (r.wrongPx < 0) return r.note ?? "секция не измерена";
      return r.poisonPx === 0 ? null : `просвет страницы ${r.poisonPx}px (${r.where})`;
    },
  },
];

export async function measureAll(themes: readonly string[] = THEMES, opts: { only?: string } = {}): Promise<Row[]> {
  const browser = await chromium.launch();
  try {
    const rows: Row[] = [];
    for (const theme of themes) {
      rows.push(...(await measureGap(browser, theme)));
      rows.push(...(await measurePadding(browser, theme, opts.only)));
    }
    return rows;
  } finally {
    await browser.close();
  }
}

export function violations(rows: Row[]): Array<Row & { rule: string; bug: string; problem: string }> {
  return rows.flatMap((r) =>
    RULES.filter((rule) => rule.applies(r))
      .map((rule) => ({ rule, problem: rule.check(r) }))
      .filter((x): x is { rule: Rule; problem: string } => x.problem !== null)
      .map(({ rule, problem }) => ({ ...r, rule: rule.id, bug: rule.bug, problem })),
  );
}

async function main() {
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
  const themes = arg("theme") ? [arg("theme")!] : THEMES;
  const rows = await measureAll(themes, { only: arg("only") });
  const widthArg = arg("width");
  const shown = widthArg ? rows.filter((r) => String(r.width) === widthArg) : rows;
  if (!process.argv.includes("--rules")) {
    for (const r of shown) {
      const mark = r.wrongPx === 0 ? "✓" : "✗";
      console.log(`${r.theme.padEnd(8)}${String(r.width).padEnd(6)}${r.case.padEnd(34)} ${mark} чужой ${r.wrongPx}px, просвет ${r.poisonPx}px ${r.where}${r.note ? " — " + r.note : ""}`);
    }
    return;
  }
  // Ноль проверенных клеток — не зелёный: у каждого правила клетка на тему и ширину.
  const expected = themes.length * WIDTHS.length;
  const short = RULES.map((rule) => ({ rule, n: rows.filter(rule.applies).length })).filter((x) => x.n < expected);
  const bad = violations(rows);
  console.log(`проверено клеток: ${rows.filter((r) => RULES.some((rule) => rule.applies(r))).length} (${RULES.length} правила × ${themes.length} тем × ${WIDTHS.length} ширины)`);
  for (const v of bad) console.log(`✗ [баг ${v.bug}] ${v.theme} ${v.width}px ${v.rule}: ${v.problem}`);
  for (const x of short) console.log(`мало клеток у «${x.rule.id}»: ${x.n} < ${expected}`);
  if (short.length || bad.length) process.exit(1);
  console.log("нарушений нет");
}

if (process.argv[1]?.endsWith("measure-section-gaps.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
