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
 * PARITY_DESIGN (25.09, регресс 7c87010e у satin): на проде признак включён у
 * ВСЕХ сайтов (`__designParity: true` во всех секциях), поэтому каждая
 * проверка ниже прогоняется И с признаком, И без — иначе сторож проверяет
 * разметку, которую никто не видит. Десктопный зазор ужесточён до РОВНО 32px
 * (gap-8) — не просто «> 0»: другое число тоже значило бы регресс.
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

/** «Незаданная» и «заданная» «Ширина» — оба случая из брифа 25.09. `undefined`
 *  не пишем в props вовсе (как реально приходит с незаполненной панели). */
const WIDTHS = [undefined, "small"] as const;
type Width = (typeof WIDTHS)[number];
const DESIGN_PARITY = [true, false] as const;

function multiRowsProps(designParity: boolean, width: Width) {
  return {
    id: "MultiRows-rowgap-guard",
    colorScheme: "1",
    padding: { top: 40, bottom: 40 },
    heading: "Мультиряды",
    ...(designParity ? { __designParity: true } : {}),
    ...(width ? { width } : {}),
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

const htmlCache = new Map<string, string>();

function render(theme: Theme, designParity: boolean, width: Width): string {
  const key = `${theme}/${designParity}/${width}`;
  const ready = htmlCache.get(key);
  if (ready !== undefined) return ready;
  const jobs = [
    { block: "MultiRows", cascade: true, live: true, props: multiRowsProps(designParity, width) },
  ];
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const row = (JSON.parse(raw) as Record<string, unknown>[])[0];
  if (typeof row.html !== "string") {
    throw new Error(
      `рендер MultiRows (${theme}, designParity=${designParity}, width=${width}) не дал HTML: ${JSON.stringify(row).slice(0, 300)}`,
    );
  }
  htmlCache.set(key, row.html);
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
  for (const designParity of DESIGN_PARITY) {
    for (const width of WIDTHS) {
      const метка = `__designParity=${designParity}, width=${width ?? "не задана"}`;

      it(`на десктопе ряды РАЗДЕЛЕНЫ РОВНО 32px (${метка}) — не путать с зазором ПАРЫ внутри ряда`, () => {
        // Владелец 20.09, после того как ряд стал сплошным: «между рядами самими
        // должен быть горизонтальный отступ». Речь именно о промежутке МЕЖДУ
        // рядами — внутри ряда медиа и текст остаются сомкнутыми, это отдельно
        // сторожит media-text-pair.spec.ts (зазор пары = 0).
        //
        // История требования по этому файлу: 17.09 — вплотную; 20.09 утром я
        // ошибочно развёл и пару, и ряды; 20.09 днём владелец уточнил — ряд
        // сплошной, а ряды друг от друга отделены. Если проверка покраснела,
        // сначала выясни, не вернули ли `lg:gap-0` на КОНТЕЙНЕР рядов «заодно».
        //
        // 25.09: РОВНО 32 (не «> 0») — на проде PARITY_DESIGN='*' включён у
        // ВСЕХ сайтов, поэтому designParity=true — рабочая ветка, и она обязана
        // мерить то же число, что designParity=false (регресс 7c87010e вернул
        // бы здесь gap-12/md:gap-20 = 48/80).
        const wrapper = rowsWrapper(render(theme, designParity, width));
        const gap = rowGapPx(theme, wrapper, DESKTOP_PX);
        expect({ theme, ...метка_объект(designParity, width), gap }).toEqual({
          theme,
          ...метка_объект(designParity, width),
          gap: 32,
        });
      });

      it(`на мобильном (одна колонка) зазор МЕЖДУ рядами НЕ ноль (${метка}) — иначе ряды сливаются в кашу`, () => {
        const wrapper = rowsWrapper(render(theme, designParity, width));
        const gap = rowGapPx(theme, wrapper, MOBILE_PX);
        expect(gap).not.toBeNull();
        expect(gap as number).toBeGreaterThan(0);
      });
    }
  }

  it("designParity не меняет СВОЙ класс обёртки рядов (gap) — байт в байт с/без признака при любой «Ширине»", () => {
    // Сравниваем именно class обёртки рядов (не всё поддерево): у ряда есть
    // ДРУГАЯ, не имеющая отношения к этому файлу настройка — размер текста
    // ряда без своего значения (ROW_TEXT_CLS.designers, satin) — она НАМЕРЕННО
    // отличается под признаком, и это не регресс зазора между рядами.
    for (const width of WIDTHS) {
      const сПризнаком = rowsWrapper(render(theme, true, width)).getAttribute("class") ?? "";
      const безПризнака = rowsWrapper(render(theme, false, width)).getAttribute("class") ?? "";
      expect({ theme, width: width ?? "не задана", сПризнаком }).toEqual({
        theme,
        width: width ?? "не задана",
        сПризнаком: безПризнака,
      });
    }
  });
});

function метка_объект(designParity: boolean, width: Width) {
  return { designParity, width: width ?? "не задана" };
}
