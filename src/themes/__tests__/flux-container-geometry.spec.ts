/**
 * Боковые поля секций темы flux: у контейнера обязан быть живой владелец.
 *
 * Баг владельца 2026-09-15: «у темы flux класс контейнера есть, а стилей у него
 * нет». Замер на живом стенде (окно 1440) это подтвердил числом:
 *   .flux-container → width 1440, x 0, max-width none, padding 0
 *   секция «Товар»  → x 0, w 1440   (контент прижат к обеим кромкам)
 * На всех четырёх окнах (1440/1024/768/375) секция «Товар» давала поле 0, тогда
 * как её соседи по главной — 80/80/80/16.
 *
 * Что было. Геометрию контейнера темы перенесли из вёрстки НЕ правилом CSS, а
 * россыпью утилит tailwind в каждой секции:
 *   mx-auto w-full max-w-[1920px] px-4 md:px-20 2xl:px-80
 * Это зафиксировано комментариями в самом порте — themes/flux/src/components/
 * Footer.astro:189 («flux-container эталона = mx-auto max-w-[1920px] px-4
 * md:px-20 2xl:px-80») и sections/Collections.astro:197. Одна секция —
 * sections/FeaturedProduct.astro:369 — при переносе утилиты не получила и
 * осталась на голом имени класса `flux-container`, которому НИ ОДНОГО правила
 * так и не написали: в собранном CSS темы (dist/theme-css/flux.css) подстрока
 * `flux-container` встречалась 0 раз. Класс-пустышка ≠ ошибка сборки, поэтому
 * молчали и сборка, и тесты, а мерчант видел секцию во всю ширину экрана.
 * Класс упомянут как мёртвый владелец в flux-baseline/PHASE-2.md:102.
 *
 * Что сторожим. Не наличие строки в CSS, а СЛЕДСТВИЕ — боковое поле, которое
 * получится в браузере:
 *   1) у каждой секции flux поле ненулевое на каждом окне;
 *   2) поле у всех секций ОДНО И ТО ЖЕ на каждом окне — то есть у геометрии
 *      один источник, а не двенадцать независимых копий, которые разъедутся;
 *   3) сама лестница закреплена числами (сейчас 16 / 40 / 80 — контейнер верстальщиков, см. EXPECTED_FIELD), иначе пункт 2 остаётся
 *      зелёным, если сдвинуть разом все секции.
 *
 * Почему поле считается суммой двух узлов. Носитель у секций разный: Collections/
 * Popular/Gallery/MainText/CollapsibleSection/ContactForm/Footer/«Товар» держат
 * лестницу на центрирующем контейнере внутри секции, а Newsletter — на самой
 * <section>. Сумма padding-inline секции и её контейнера даёт одно и то же
 * «боковое поле» независимо от того, на каком из двух узлов его записали, —
 * иначе перенос отступа на соседний узел красил бы гард без изменения картинки.
 *
 * Победителя каскада считает общий движок src/themes/__tests__/lib/css-cascade.ts
 * (слои → специфичность → порядок → инлайн), а не регулярка по тексту: подмена
 * инлайн-стилем или правилом из другого слоя обязана красить проверку.
 *
 * Требует сборки (тот же порядок, что в CI):
 *   pnpm build                     — dist/src (adaptLegacyProps, resolveBlockProps);
 *   pnpm build:theme-sections flux — порт секций темы + dist/theme-css/flux.css.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, type HTMLElement } from "node-html-parser";

import { parseRules, winnerIn, type Rule } from "./lib/css-cascade";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEME = "flux";

/** Окна замера: три ступени лестницы плюс те, на которых мерил владелец. */
const VIEWPORTS = [375, 768, 1024, 1440, 1536] as const;

/**
 * Эталонная лестница полей темы (px) — ТА, ЧТО ВИДИТ ПОКУПАТЕЛЬ. На проде у
 * всех сайтов режим «как у верстальщиков», и контейнер flux — их
 * `.flux-container`: max-w-[1480px] px-4 md:px-10 lg:px-20 (порт
 * `themes/flux/src/styles/global.css`). Прежняя лестница 16/80/320 при
 * max-w-[1920px] осталась только в ветке без режима, которую на проде никто
 * не видит (сверка 25.09, проверки переведены на путь прода).
 */
const EXPECTED_FIELD: Record<number, number> = {
  375: 16, // px-4
  768: 40, // md:px-10
  1024: 80, // lg:px-20
  1440: 80,
  1536: 80,
};

const EXPECTED_MAX_WIDTH_PX = 1480;

/**
 * Секции главной и подвала темы. «Товар» — та самая, что висела на пустом
 * классе; остальные держат ту же геометрию утилитами и служат ей эталоном.
 */
const SECTIONS: {
  name: string;
  block: string;
  props: Record<string, unknown>;
}[] = [
  { name: "«Товар»", block: "Product", props: { siteId: "guard-site" } },
  { name: "«Список коллекций»", block: "Collections", props: {} },
  { name: "«Популярные товары»", block: "PopularProducts", props: {} },
  { name: "«Текст»", block: "MainText", props: {} },
  { name: "«Галерея»", block: "Gallery", props: {} },
  { name: "«Раскрывающийся список»", block: "CollapsibleSection", props: {} },
  { name: "«Форма обратной связи»", block: "ContactForm", props: {} },
  { name: "«Подписка»", block: "Newsletter", props: {} },
  { name: "«Подвал»", block: "Footer", props: {} },
];

// ---------------------------------------------------------------- рендер и CSS

let htmlCache: Map<string, string> | null = null;

function renderAll(): Map<string, string> {
  if (htmlCache) return htmlCache;
  const jobs = SECTIONS.map((s, i) => ({
    block: s.block,
    cascade: true,
    live: true,
    props: { id: `${s.block}-geom-${i}`, ...s.props },
  }));
  const raw = execFileSync("node", [RENDERER, THEME, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const rows = JSON.parse(raw) as {
    block: string;
    html?: string;
    missing?: boolean;
    error?: string;
  }[];
  const out = new Map<string, string>();
  rows.forEach((r, i) => {
    const name = SECTIONS[i].name;
    if (r.missing)
      throw new Error(`${name}: в теме ${THEME} нет блока ${r.block}`);
    if (r.error) throw new Error(`${name}: ошибка рендера — ${r.error}`);
    if (!r.html) throw new Error(`${name}: пустой HTML`);
    out.set(name, r.html);
  });
  htmlCache = out;
  return out;
}

let cssCache: string | null = null;
function themeCss(): string {
  if (cssCache !== null) return cssCache;
  cssCache = readFileSync(
    resolve(SITES_ROOT, "dist", "theme-css", `${THEME}.css`),
    "utf-8",
  );
  return cssCache;
}

let rulesCache: Rule[] | null = null;
function themeRules(): Rule[] {
  if (rulesCache) return rulesCache;
  rulesCache = parseRules(themeCss());
  return rulesCache;
}

/** Шаг спейсинга tailwind из самой темы: `calc(var(--spacing) * 20)` → px. */
function spacingRem(): number {
  const m = /--spacing:\s*([\d.]+)rem/.exec(themeCss());
  return m ? Number(m[1]) : 0.25;
}

/** Значение CSS → px. Понимает px, rem и `calc(var(--spacing) * N)`. */
function toPx(value: string | undefined | null): number | null {
  if (!value) return null;
  const v = value.replace(/!\s*important\s*$/i, "").trim();
  if (v === "0") return 0;
  const calc = /calc\(\s*var\(--spacing\)\s*\*\s*(-?[\d.]+)\s*\)/.exec(v);
  if (calc) return Number(calc[1]) * spacingRem() * 16;
  const rem = /^(-?[\d.]+)rem$/.exec(v);
  if (rem) return Number(rem[1]) * 16;
  const px = /^(-?[\d.]+)px$/.exec(v);
  if (px) return Number(px[1]);
  return null;
}

/**
 * Победитель каскада для бокового отступа узла: сначала логическое
 * `padding-inline`, при его отсутствии — физические `padding-left`/`right`.
 */
function sidePadding(el: HTMLElement, width: number): number {
  const css = themeCss();
  const rules = themeRules();
  const inline = winnerIn(css, rules, el, "padding-inline", width);
  const fromInline = toPx(inline?.decls["padding-inline"]);
  if (fromInline !== null) return fromInline;
  const left = winnerIn(css, rules, el, "padding-left", width);
  return toPx(left?.decls["padding-left"]) ?? 0;
}

/** Центрирующий контейнер секции: носитель `flux-container` или `margin-inline:auto`. */
function containerOf(section: HTMLElement, width: number): HTMLElement | null {
  const named = section.querySelector(".flux-container");
  if (named) return named;
  for (const el of section.querySelectorAll("*")) {
    const win = winnerIn(themeCss(), themeRules(), el, "margin-inline", width);
    if (win && /\bauto\b/.test(win.decls["margin-inline"] ?? "")) return el;
  }
  return null;
}

type Geometry = { field: number; maxWidth: number | null; carrier: string };

function geometry(name: string, width: number): Geometry {
  const html = renderAll().get(name);
  if (!html) throw new Error(`нет HTML секции ${name}`);
  const root = parse(html);
  // Корень блока — его первый ЗНАЧИМЫЙ элемент верхнего уровня, а не первый
  // попавшийся <section>: у «Подвала» корень <footer>, а внутри лежит
  // собственная <section> подписки, и поиск по тегу уводил замер на вложенный
  // узел без контейнера. Служебные <style>/<script>, которыми секции темы
  // начинаются (Collections, Popular), пропускаем — иначе корнем становится они.
  const SERVICE = new Set(["STYLE", "SCRIPT", "TEMPLATE", "LINK", "META"]);
  const section =
    root
      .querySelectorAll("*")
      .find((el) => el.parentNode === root && !SERVICE.has(el.tagName)) ?? root;
  const container = containerOf(section, width);
  if (!container) {
    throw new Error(
      `${name}: не нашёл центрирующий контейнер (ни .flux-container, ни margin-inline:auto)`,
    );
  }
  const maxWin = winnerIn(
    themeCss(),
    themeRules(),
    container,
    "max-width",
    width,
  );
  return {
    field: sidePadding(section, width) + sidePadding(container, width),
    maxWidth: toPx(maxWin?.decls["max-width"]),
    carrier: (container.getAttribute("class") ?? "").slice(0, 70),
  };
}

// ------------------------------------------------------------------ проверки

describe("flux: боковые поля секций", () => {
  describe.each(VIEWPORTS)("окно %i px", (width) => {
    it.each(SECTIONS.map((s) => s.name))("%s — поле не нулевое", (name) => {
      const { field, carrier } = geometry(name, width);
      expect({
        секция: name,
        окно: width,
        поле: field,
        носитель: carrier,
      }).toEqual(expect.objectContaining({ поле: expect.any(Number) }));
      expect(field).toBeGreaterThan(0);
    });

    it("поле одинаково у всех секций — у геометрии один источник", () => {
      const measured = SECTIONS.map((s) => ({
        секция: s.name,
        поле: geometry(s.name, width).field,
      }));
      const distinct = [...new Set(measured.map((m) => m.поле))].sort(
        (a, b) => a - b,
      );
      expect({ окно: width, значения: distinct, замер: measured }).toEqual(
        expect.objectContaining({ значения: [EXPECTED_FIELD[width]] }),
      );
    });

    it(`лестница закреплена: поле = ${EXPECTED_FIELD[width]} px`, () => {
      for (const s of SECTIONS) {
        expect({
          секция: s.name,
          окно: width,
          поле: geometry(s.name, width).field,
        }).toEqual({
          секция: s.name,
          окно: width,
          поле: EXPECTED_FIELD[width],
        });
      }
    });
  });

  it("контейнер «Товара» ограничен той же максимальной шириной, что у соседей", () => {
    const measured = SECTIONS.map((s) => ({
      секция: s.name,
      maxWidth: geometry(s.name, 1440).maxWidth,
    }));
    for (const m of measured) {
      expect(m).toEqual({ секция: m.секция, maxWidth: EXPECTED_MAX_WIDTH_PX });
    }
  });
});
