/**
 * MultiRows: зазор МЕЖДУ рядами (не путать с зазором пары «медиа+текст»
 * ВНУТРИ ряда — тот отдельно сторожит media-text-pair.spec.ts и не менялся
 * этой задачей).
 *
 * Жалоба владельца, 2026-09-17 (дословно, со скриншотами редактора Shopify —
 * секция «Row»): «посмотри какие отступы страшные у мульти рядов». На
 * эталонных скриншотах ряды идут ВПЛОТНУЮ друг к другу: на значении Width
 * «Small» видно два ряда подряд, и между ними НЕТ вертикального зазора вовсе —
 * низ первого ряда это верх второго.
 *
 * Замер «до» (источник — сам файл темы, литералы Tailwind default-шкалы
 * 1unit=4px, брейкпоинты default: lg=1024, md=768):
 *   flux:    ul gap-12 md:gap-16      → 48px / 64px
 *   rose:    ul gap-10 md:gap-14      → 40px / 56px
 *   vanilla: ul gap-10 (без брейкпоинта) → 40px везде
 *   bloom:   ul gap-10 (без брейкпоинта) → 40px везде
 *   satin:   div gap-12 md:gap-20     → 48px / 80px
 *
 * Правка 17.09: зазор МЕЖДУ рядами обнулён РОВНО на брейкпоинте, где ряд
 * становится двухколоночным (lg: у rose/vanilla/bloom/flux, md: у satin).
 *
 * ТРЕБОВАНИЕ ОТМЕНЕНО ВЛАДЕЛЬЦЕМ 20.09 — и это НЕ регрессия, а разворот
 * канона. Дословно: «остались отступы нужно добавить отступы» и «скругление
 * отвалилось когда отступов не было». Замер его живой главной (сайт
 * 695f190f…, тема bloom, 1440px, playwright по настоящему превью) показывал
 * ровно то, что требование и предписывало: зазор внутри ряда 0px, зазор между
 * рядами 0px, скругление медиа 0px со всех четырёх сторон.
 *
 * Поэтому зазор возвращён на ВСЕХ ширинах, а вместе с ним и скругления: пока
 * ряды шли вплотную, углы на стыке намеренно квадратили (`lg:rounded-none` у
 * bloom, `lg:rounded-l-none`/`-r-none` у остальных), чтобы медиа и текст
 * читались одной полосой. Отдельными карточками эти override-ы бессмысленны —
 * сняты.
 *
 * Мобильный зазор не трогали ни разу: на одной колонке ноль склеил бы кнопку
 * ряда N с фото ряда N+1.
 *
 * ЧТО СТОРОЖИМ. Не наличие строки в исходнике, а ПОБЕДИТЕЛЯ КАСКАДА в реальных
 * собранных бандлах для реальных узлов реального рендера — тот же движок и тот
 * же приём (`scripts/qa/lib`), что и media-text-pair.spec.ts. Обёртка рядов
 * ищется как ОБЩИЙ РОДИТЕЛЬ узлов `[data-puck-subsection-field="rows"]` —
 * тот самый <ul>/<div>, на который навешан gap.
 *
 * Требует сборки (тот же порядок, что в CI):
 *   pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, type HTMLElement } from "node-html-parser";

import { loadBundle, pxOf } from "../../../scripts/qa/lib";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const THEMES = ["rose", "vanilla", "bloom", "satin", "flux"] as const;
type Theme = (typeof THEMES)[number];

/** Порог, на котором пара «медиа+текст» ВНУТРИ ряда становится двухколоночной
 *  для четырёх тем из пяти (lg=1024). satin переходит раньше — на md=768,
 *  проверяется отдельным DESKTOP_PX_SATIN. */
const DESKTOP_PX = 1440;
const MOBILE_PX = 375;

function multiRowsProps() {
  return {
    id: "MultiRows-rowgap-guard",
    colorScheme: "1",
    padding: { top: 40, bottom: 40 },
    heading: "Мультиряды",
    rows: [
      {
        id: "row-1",
        title: "Ряд 1",
        description: "Текст ряда 1",
        image: "",
        size: "small",
        button: { text: "Кнопка", link: "/catalog" },
      },
      {
        id: "row-2",
        title: "Ряд 2",
        description: "Текст ряда 2",
        image: "",
        size: "small",
        button: { text: "Кнопка", link: "/catalog" },
      },
    ],
  };
}

const htmlCache = new Map<Theme, string>();

function render(theme: Theme): string {
  const ready = htmlCache.get(theme);
  if (ready !== undefined) return ready;
  const jobs = [{ block: "MultiRows", cascade: true, live: true, props: multiRowsProps() }];
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const row = (JSON.parse(raw) as Record<string, unknown>[])[0];
  if (typeof row.html !== "string") {
    throw new Error(
      `рендер MultiRows (${theme}) не дал HTML: ${JSON.stringify(row).slice(0, 300)}`,
    );
  }
  htmlCache.set(theme, row.html);
  return row.html;
}

/**
 * Обёртка списка рядов = САМЫЙ БЛИЗКИЙ общий родитель ДВУХ узлов ряда
 * (`[data-puck-subsection-field="rows"]`). Именно на этом узле лежит
 * `gap`/`row-gap`, отвечающий за зазор МЕЖДУ рядами (а не внутри ряда).
 */
function rowsWrapper(html: string): HTMLElement {
  const root = parse(html);
  const rows = root.querySelectorAll('[data-puck-subsection-field="rows"]') as HTMLElement[];
  if (rows.length < 2) {
    throw new Error(
      `меньше двух рядов в разметке (${rows.length}) — гард не может измерить зазор МЕЖДУ рядами`,
    );
  }
  const parent = rows[0].parentNode as HTMLElement | null;
  if (!parent) {
    throw new Error("у первого ряда нет родителя — обёртка списка рядов не найдена");
  }
  const sameParent = rows.every((r) => r.parentNode === parent);
  if (!sameParent) {
    throw new Error("ряды лежат не в одном списке — обёртка не найдена однозначно");
  }
  return parent;
}

const rowGapPx = (theme: Theme, el: HTMLElement, widthPx: number): number | null =>
  pxOf(loadBundle(theme, { withPreview: false }), el, ["row-gap", "gap"], widthPx);

describe.each(THEMES)("MultiRows — зазор МЕЖДУ рядами — %s", (theme) => {
  it("на десктопе (двухколоночная раскладка ряда) ряды РАЗДЕЛЕНЫ зазором", () => {
    // Владелец 20.09 отменил своё же требование «вплотную» от 17.09. Ноль
    // здесь — не регрессия вёрстки, а возврат снятого канона: если проверка
    // покраснела, сперва выясни, не вернули ли `lg:gap-0` «заодно».
    const wrapper = rowsWrapper(render(theme));
    const gap = rowGapPx(theme, wrapper, DESKTOP_PX);
    expect(gap).not.toBeNull();
    expect({ theme, положительный: (gap as number) > 0 }).toEqual({ theme, положительный: true });
  });

  it("стык не квадратят: нет скруглений, гасимых только на широком экране", () => {
    // Жалоба владельца 20.09 — «скругление отвалилось». Пока ряды шли вплотную,
    // углы на стыке намеренно гасили, и на десктопе радиус становился нулевым.
    //
    // Меряем ИСХОДНИК порта, а не каскад: движок `pxOf` радиус не разрешает —
    // проверено, он возвращает null на обеих ширинах, поэтому сравнение
    // «десктоп = мобильный» зеленело на пустоте. Опора ниже сторожит, что файл
    // вообще прочитан и содержит скругление, иначе запреты пройдут по пустому
    // месту.
    const src = readFileSync(
      resolve(SITES_ROOT, `themes/${theme}/src/components/sections/MultiRows.astro`),
      "utf-8",
    );
    expect(src).toMatch(/rounded-\[/);
    for (const banned of [
      "lg:rounded-none",
      "md:rounded-none",
      "lg:rounded-l-none",
      "lg:rounded-r-none",
    ]) {
      expect({ theme, banned, есть: src.includes(banned) }).toEqual({ theme, banned, есть: false });
    }
  });

  it("на мобильном (одна колонка) зазор МЕЖДУ рядами НЕ ноль — иначе ряды сливаются в кашу", () => {
    const wrapper = rowsWrapper(render(theme));
    const gap = rowGapPx(theme, wrapper, MOBILE_PX);
    expect(gap).not.toBeNull();
    expect(gap as number).toBeGreaterThan(0);
  });
});
