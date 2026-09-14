/**
 * Секция «Товар»: описание начинается с ПЕРВОЙ строки своего блока.
 *
 * Жалоба тестировщика 2026-09-14 (магазин 7b64b7a527d2, тема rose):
 *   «описание в товаре поднять в начало параметра, сейчас отступ большой,
 *    так как убрали слово ОПИСАНИЕ».
 *
 * ЗАМЕР «ДО» (живая витрина, playwright, 1440px, 2026-09-14):
 *   innerHTML абзаца = "\n      hhhhhh\n    ";
 *   white-space: pre-line; высота абзаца 48px на шесть символов;
 *   текст в 25px от верха собственного блока — то есть на ВТОРОЙ строке.
 *   Зазор колонки над описанием — 40px, ровно как у всех остальных групп.
 *
 * Причина — не шаг колонки, а сам абзац: `whitespace-pre-line` печатает
 * переводы строк, а Astro сохраняет отбивку шаблона вокруг `{trimmed}`.
 * Пустая первая строка и читалась как «большой отступ»: заголовок «ОПИСАНИЕ»
 * раньше стоял над ней и скрывал провал. `content.trim()` не спасает —
 * пробелы приходят из вёрстки, а не из данных мерчанта.
 *
 * Проверяем не класс, а результат: текст обязан стоять в начале узла. Считаем
 * ведущие переводы строк в отпечатанном HTML — при `pre-line` каждый из них
 * станет пустой строкой на витрине.
 *
 * Портов у секции два (авторитет — `dist/theme-sections/<тема>/manifest.json`):
 *   • packages/theme-base/blocks/Product/Product.astro          — rose, bloom, satin, vanilla
 *   • themes/flux/src/components/sections/FeaturedProduct.astro — flux
 *
 * Рендер требует сборки (тот же порядок, что в CI):
 *   pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse, type HTMLElement } from "node-html-parser";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
/** Каталог магазина для flux: он резолвит товар HTTP-запросом во фронтматтере. */
const CATALOG_STUB = resolve(__dirname, "product-description-stub.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
type Theme = (typeof THEMES)[number];

const DESCRIPTION_MARK = "ОПИСАНИЕ_ИЗ_АДМИНКИ_МАЯЧОК";

const pkgFor = (theme: Theme) => (theme === "flux" ? undefined : "theme-base");

const baseProps = (theme: Theme) => ({
  id: "Product-1",
  siteId: "test-site",
  productId: theme === "flux" ? "p1" : "",
  colorScheme: "scheme-1",
  padding: { top: 40, bottom: 40 },
  description: { content: DESCRIPTION_MARK, size: "medium" },
  ...(theme === "flux" ? { visualConfig: { showDescription: true } } : {}),
});

const кэш = new Map<Theme, string>();

function renderLive(theme: Theme): string {
  const готовое = кэш.get(theme);
  if (готовое !== undefined) return готовое;
  const jobs = [
    { block: "Product", pkg: pkgFor(theme), props: baseProps(theme), live: true },
  ];
  const raw = execFileSync(
    "node",
    ["--import", CATALOG_STUB, RENDERER, theme, JSON.stringify(jobs)],
    { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
  );
  const row = (JSON.parse(raw) as Record<string, string>[])[0];
  if (row.html === undefined) {
    throw new Error(`рендер «Товар» (${theme}) не дал HTML: ${JSON.stringify(row)}`);
  }
  кэш.set(theme, row.html);
  return row.html;
}

/** Узлы описания внутри секции. У flux их два — desktop и mobile дерево. */
const узлыОписания = (html: string): HTMLElement[] =>
  parse(html).querySelectorAll('[data-puck-subsection-field="description"]');

/** Печатает ли узел переводы строк как есть (иначе отбивка схлопнется). */
const печатаетПереносы = (el: HTMLElement): boolean =>
  /\bwhitespace-pre(-line|-wrap)?\b/.test(el.classNames ?? "");

/**
 * Сколько пустых строк встанет ПЕРЕД текстом.
 *
 * При `pre-line` ведущие пробелы схлопываются, а каждый `\n` даёт разрыв
 * строки. Первый `\n` уводит текст на вторую строку — это и есть провал.
 */
export function пустыхСтрокСверху(innerHTML: string, pre: boolean): number {
  if (!pre) return 0;
  const ведущие = /^[^\S\n]*(\n[^\S\n]*)*/.exec(innerHTML)?.[0] ?? "";
  return (ведущие.match(/\n/g) ?? []).length;
}

/** Текстовые узлы описания вместе с вердиктом. */
function абзацыОписания(theme: Theme) {
  const итог: { html: string; pre: boolean; пустых: number }[] = [];
  for (const узел of узлыОписания(renderLive(theme))) {
    for (const el of [узел, ...узел.querySelectorAll("*")]) {
      if (!el.textContent.includes(DESCRIPTION_MARK)) continue;
      // берём самый глубокий узел — тот, что реально печатает текст
      if (el.querySelectorAll("*").some((c) => c.textContent.includes(DESCRIPTION_MARK))) continue;
      const pre = печатаетПереносы(el);
      итог.push({ html: el.innerHTML, pre, пустых: пустыхСтрокСверху(el.innerHTML, pre) });
    }
  }
  return итог;
}

const built = (theme: Theme) =>
  existsSync(resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"));

// ─────────────────── описание начинается с первой строки ────────────────────

describe.each(THEMES)("«Товар» / %s: текст описания в начале своего блока", (theme) => {
  it("секции темы собраны (pnpm build:theme-sections)", () => {
    expect(built(theme)).toBe(true);
  });

  it("описание отрисовано (иначе проверка вырождена)", () => {
    expect(renderLive(theme)).toContain(DESCRIPTION_MARK);
    expect(абзацыОписания(theme).length).toBeGreaterThan(0);
  });

  it("пустых строк перед текстом нет ни в одном дереве порта", () => {
    const плохие = абзацыОписания(theme)
      .filter((а) => а.пустых > 0)
      .map((а) => `${а.пустых} пустых строк(и) перед текстом: ${JSON.stringify(а.html.slice(0, 60))}`);
    expect(плохие).toEqual([]);
  });

  it("текст не оторван от начала узла и хвостом", () => {
    // Хвостовой `\n` при pre-line добавляет ещё одну строку снизу — блок
    // описания раздувается, и следующая группа отъезжает.
    const плохие = абзацыОписания(theme)
      .filter((а) => а.pre && /\n\s*$/.test(а.html))
      .map((а) => JSON.stringify(а.html.slice(-40)));
    expect(плохие).toEqual([]);
  });
});

// ───────── мёртвая колонка в общем примитиве (остаток от заголовка) ─────────

describe("общий примитив описания: обёртка не колонка с gap", () => {
  it.each(["rose", "bloom", "satin", "vanilla"] as const)("%s", (theme) => {
    const обёртка = parse(renderLive(theme)).querySelector("[data-product-description]");
    expect(обёртка).not.toBeNull();
    const cls = обёртка!.classNames;
    // `flex flex-col gap-2` держала расстояние между h2 и телом. h2 нет —
    // ребёнок один, колонка с gap'ом мёртвая.
    expect({ flex: /\bflex\b/.test(cls), gap: /\bgap-/.test(cls) }).toEqual({
      flex: false,
      gap: false,
    });
  });
});

// ───────────────────────────── саботаж детектора ─────────────────────────────

describe("саботаж: детектор пустой строки не вырожден", () => {
  it("состояние ДО правки ловится (ровно тот innerHTML с витрины)", () => {
    expect(пустыхСтрокСверху("\n      hhhhhh\n    ", true)).toBe(1);
  });

  it("две отбивки — две пустые строки", () => {
    expect(пустыхСтрокСверху("\n\n   текст", true)).toBe(2);
  });

  it("правленый вид даёт ноль", () => {
    expect(пустыхСтрокСверху("hhhhhh", true)).toBe(0);
  });

  it("без pre-line отбивка безвредна — детектор не кричит зря", () => {
    // Узость: правка про `whitespace-pre-line`, а не «выкинуть все переносы».
    expect(пустыхСтрокСверху("\n      hhhhhh\n    ", false)).toBe(0);
  });

  it("ведущие ПРОБЕЛЫ без перевода строки пустой строки не дают", () => {
    expect(пустыхСтрокСверху("      hhhhhh", true)).toBe(0);
  });

  it("класс pre-line опознаётся, обычный — нет", () => {
    const узел = (cls: string) => parse(`<p class="${cls}">x</p>`).querySelector("p")!;
    expect(печатаетПереносы(узел("m-0 whitespace-pre-line"))).toBe(true);
    expect(печатаетПереносы(узел("m-0 whitespace-pre-wrap"))).toBe(true);
    expect(печатаетПереносы(узел("m-0 leading-normal"))).toBe(false);
    expect(печатаетПереносы(узел("m-0 whitespace-nowrap"))).toBe(false);
  });
});
