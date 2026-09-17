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
 * Правка (эта задача): зазор МЕЖДУ рядами обнулён РОВНО на брейкпоинте, где
 * ряд становится двухколоночным (тот же порог, на котором media-text-pair
 * обнулила зазор пары «медиа+текст»: lg: у rose/vanilla/bloom/flux, md: у
 * satin — satin переходит на 2 колонки раньше остальных, см.
 * MultiRows.astro:ROW_SPLIT). На мобильном (одна колонка, картинка над
 * текстом) зазор НЕ убран — иначе кнопка ряда N легла бы прямо на фото ряда
 * N+1 и ряды читались бы кашей; унифицирован на 32px (gap-8) во всех пяти
 * темах — умеренный ритм, ближе друг к другу, чем было (32-48px до правки), но
 * не ноль.
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
  it("на десктопе (двухколоночная раскладка ряда) зазор МЕЖДУ рядами РОВНО ноль — ряды соприкасаются", () => {
    const wrapper = rowsWrapper(render(theme));
    const gap = rowGapPx(theme, wrapper, DESKTOP_PX);
    expect({ theme, gap }).toEqual({ theme, gap: 0 });
  });

  it("на мобильном (одна колонка) зазор МЕЖДУ рядами НЕ ноль — иначе ряды сливаются в кашу", () => {
    const wrapper = rowsWrapper(render(theme));
    const gap = rowGapPx(theme, wrapper, MOBILE_PX);
    expect(gap).not.toBeNull();
    expect(gap as number).toBeGreaterThan(0);
  });
});
