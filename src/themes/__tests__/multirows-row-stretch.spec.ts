/**
 * Мультиряды: медиа и текст СТЫКУЮТСЯ ПО ВЫСОТЕ на КАЖДОЙ ширине окна, где ряд
 * стал двухколоночным — на ЛЮБОЙ комбинации «Высота»/«Ширина»/«Позиция рядов».
 *
 * ЖАЛОБА ВЛАДЕЛЬЦА (2026-09-17, дважды): «раскладка ломается при сужении окна»
 * (скрин ~950-1000px, тёмная секция, два ряда) и, отдельно, «ломается НЕ от
 * сужения, а от сочетания настроек» (скрин из конструктора на широком экране,
 * ~1000px полотно, Высота=Большая + Ширина=Маленькая + Позиция=Слева): медиа
 * НЕ растянуто на высоту ряда, под ним/над ним остаётся полоса фона страницы,
 * текстовый блок и медиа заканчиваются на разной высоте.
 *
 * РЕАЛЬНЫЙ ЗАМЕР (Chromium 1800×W, три b57/b62/b70-фикстуры + пять новых
 * сочетаний настроек, 375/768/900/960/1024/1280/1920): «ДО» этой правки —
 * rose/vanilla/flux ломались НА ЛЮБОЙ ширине ≥ брейкпоинта (не только на
 * промежуточной!) и НА ЛЮБОЙ комбинации: mediaH и textH расходились на 30-670px
 * (rose default/1920: 820 vs 150). bloom/satin — 0 расхождения на всех клетках.
 * Причина — align-items ряда/align-self текстовой колонки:
 *   • rose/flux: `lg:items-center` на самом ряду — снимал дефолтное
 *     растяжение ОБОИХ колонок (grid align-items:normal ⇒ stretch по
 *     умолчанию), обе колонки схлопывались до своей натуральной высоты и
 *     центрировались — расхождение в ЛЮБУЮ сторону в зависимости от того, что
 *     выше: медиа (фикс-аспект) или текст (по контенту, растёт с Высотой/
 *     headingSize/длиной описания).
 *   • vanilla: `lg:self-center` ТОЛЬКО на текстовой колонке — медиа тянулось
 *     (нет своего оверрайда), текст оставался высотой по контенту: тоже самое
 *     расхождение, только текст всегда короче медиа.
 *   • bloom/satin эталон: без такого оверрайда (bloom) или с явным
 *     `items-stretch` (satin) — grid растягивает обе колонки на высоту ряда
 *     по умолчанию, mediaH===textH ВСЕГДА. Картинка внутри — object-cover
 *     (`!h-full !w-full` / `absolute inset-0 size-full`), поэтому растянутый
 *     контейнер просто обрезает фото по новой высоте без искажений — это и
 *     есть исправление (см. themes/{rose,flux,vanilla}/…/MultiRows.astro).
 *
 * ПОЧЕМУ ТРИ ПРЕЖНИХ ГАРДА (b57 media-text-pair, b62 multirows-row-gap, b70
 * media-text-pair §6) ЭТО ПРОПУСТИЛИ: все трое проверяют геометрию ПАРЫ на
 * ОДНОЙ ширине (1440 — `DESKTOP_PX` в media-text-pair.spec.ts) и ни один не
 * смотрит на align-items/align-self колонок. Здесь — другое измерение
 * (вертикальное растяжение), и оно ломано на ВСЕХ ширинах ≥ брейкпоинта, не
 * только на «промежуточной» — поэтому гард ниже проверяет несколько ширин
 * (пойман бы был и на 1280) и несколько сочетаний настроек, а не только дефолт.
 *
 * ЧТО СТОРОЖИМ: победителя каскада (`align-items` на ряду, `align-self` на
 * каждой из двух колонок) в РЕАЛЬНОМ бандле темы — а не «есть ли класс в
 * разметке». `center` на любом из двух узлов при двухколоночной раскладке —
 * прямой рецидив: обе колонки перестают тянуться на высоту ряда синхронно.
 *
 * Требует сборки (тот же порядок, что в CI):
 *   pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parse, type HTMLElement } from "node-html-parser";

import { declaredValue, loadBundle } from "../../../scripts/qa/lib";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const THEMES = ["rose", "vanilla", "bloom", "satin", "flux"] as const;
type Theme = (typeof THEMES)[number];

/**
 * Ширины замера. Ниже брейкпоинта ряд одноколоночный (align неважен); дальше —
 * ТОЧКА переключения (768/1024), «промежуточная» из первой жалобы (900/960) и
 * широкий десктоп (1280/1920) — где ловится вторая жалоба (широкий экран +
 * сочетание настроек).
 */
const WIDTHS = [375, 768, 900, 960, 1024, 1280, 1920] as const;

/** Высота/Ширина/Позиция — три настройки из второй жалобы владельца. */
type Combo = {
  tag: string;
  size?: "small" | "medium" | "large";
  width?: "small" | "medium" | "large";
  rowsPosition?: "left" | "right";
};
const COMBOS: Combo[] = [
  { tag: "default (без настроек)" },
  { tag: "Высота=Большая, Ширина=Маленькая, Позиция=Слева", size: "large", width: "small", rowsPosition: "left" },
  { tag: "Высота=Большая, Ширина=Маленькая, Позиция=Справа", size: "large", width: "small", rowsPosition: "right" },
  { tag: "Высота=Маленькая, Ширина=Большая, Позиция=Слева", size: "small", width: "large", rowsPosition: "left" },
  { tag: "Высота=Средняя, Ширина=Средняя, Позиция=Слева", size: "medium", width: "medium", rowsPosition: "left" },
];

// ─────────────────────────────── рендер ───────────────────────────────

function propsFor(combo: Combo) {
  return {
    id: "MultiRows-stretch-guard",
    colorScheme: "1",
    padding: { top: 40, bottom: 40 },
    size: combo.size,
    width: combo.width,
    rowsPosition: combo.rowsPosition,
    heading: "Мультиряды",
    alignment: "left",
    rows: [
      {
        id: "row-1",
        title: "Ряд один",
        // Текст сознательно длиннее умолчания rose/vanilla/bloom (заголовок
        // «Мультиряды» + короткое описание) — короткий текст на многих
        // сочетаниях НЕ вскрывает расхождение (медиа и так натурально выше),
        // а владелец жаловался именно на длинный реальный контент.
        description:
          "Покажи и расскажи о своём товаре в одном блоке. Достаточно длинный текст, чтобы текстовая колонка стала заметно выше медиа при настройке «Высота».",
        image: "",
        button: { text: "Кнопка", link: "/catalog" },
      },
      {
        id: "row-2",
        title: "Ряд два",
        description: "Второй ряд, зеркальная сторона медиа.",
        image: "",
        button: { text: "Кнопка", link: "/catalog" },
      },
    ],
  };
}

const htmlCache = new Map<string, string>();

function renderRows(theme: Theme, combo: Combo): string {
  const key = `${theme}/${combo.tag}`;
  const ready = htmlCache.get(key);
  if (ready !== undefined) return ready;
  const jobs = [{ block: "MultiRows", cascade: true, live: true, props: propsFor(combo) }];
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const row = (JSON.parse(raw) as Record<string, string>[])[0];
  if (row.html === undefined) {
    throw new Error(
      `рендер MultiRows (${theme}, ${combo.tag}) не дал HTML: ${JSON.stringify(row).slice(0, 300)}`,
    );
  }
  htmlCache.set(key, row.html);
  return row.html;
}

const elementChildren = (el: HTMLElement): HTMLElement[] =>
  el.childNodes.filter((n): n is HTMLElement => (n as HTMLElement).tagName !== undefined);

const looksLikeMedia = (el: HTMLElement): boolean =>
  /aspect-|relative/.test(el.getAttribute("class") ?? "") ||
  el.querySelector("img") !== null ||
  el.getAttribute("aria-hidden") !== undefined;

/** Обе пары рядов (row-1, row-2) секции — b70/media-text-pair берёт только rows[0]. */
function findPairs(theme: Theme, combo: Combo): { row: HTMLElement; media: HTMLElement; text: HTMLElement }[] {
  const section = parse(renderRows(theme, combo));
  const root = section.querySelector("[data-puck-component-id]") ?? (section.firstChild as HTMLElement);
  const rows = root.querySelectorAll('[data-puck-subsection-field="rows"]');
  if (!rows.length) throw new Error(`ряды MultiRows не найдены (${theme}, ${combo.tag})`);
  return rows.map((row) => {
    const kids = elementChildren(row);
    if (kids.length !== 2) {
      throw new Error(`ряд не пара media+text (${theme}, ${combo.tag}): ${kids.length} детей`);
    }
    const media = kids.find(looksLikeMedia) ?? kids[0];
    const text = kids.find((k) => k !== media) as HTMLElement;
    return { row, media, text };
  });
}

// ───────────────────────────── проверки ─────────────────────────────

describe("MultiRows: медиа и текст растягиваются на одну высоту ряда (align-items)", () => {
  for (const theme of THEMES) {
    for (const combo of COMBOS) {
      it(`${theme} / ${combo.tag}: на КАЖДОЙ ширине, где ряд двухколоночный, ни ряд, ни колонки не центрируются по высоте`, () => {
        const bundle = loadBundle(theme, { withPreview: false });
        const pairs = findPairs(theme, combo);
        const offenders: Array<{ width: number; rowIndex: number; node: string; prop: string; value: string }> = [];

        for (const width of WIDTHS) {
          pairs.forEach((pair, rowIndex) => {
            const template = declaredValue(bundle, pair.row, ["grid-template-columns"], width)?.value ?? null;
            const cols = template && /^\d+(?:\.\d+)?fr\s+\d+(?:\.\d+)?fr$/.test(template) ? 2 : 1;
            if (cols < 2) return; // одноколоночная раскладка — align неважен (мобилка).

            const rowAlign = declaredValue(bundle, pair.row, ["align-items"], width)?.value ?? null;
            if (rowAlign === "center") {
              offenders.push({ width, rowIndex, node: "row (align-items родителя)", prop: "align-items", value: rowAlign });
            }
            for (const [label, node] of [
              ["media", pair.media],
              ["text", pair.text],
            ] as const) {
              const selfAlign = declaredValue(bundle, node, ["align-self"], width)?.value ?? null;
              if (selfAlign === "center") {
                offenders.push({ width, rowIndex, node: label, prop: "align-self", value: selfAlign });
              }
            }
          });
        }

        expect({ theme, combo: combo.tag, offenders }).toEqual({
          theme,
          combo: combo.tag,
          offenders: [],
        });
      });
    }
  }
});
