/**
 * Пара «медиа + текст»: зазор, доли колонок, живая «Ширина».
 *
 * Жалоба владельца 2026-09-15 (дословно): «контейнер и медиа соприкасаются;
 * если медиа маленького размера, контейнер берёт на себя больше места, и так же
 * наоборот». Секция — семья «медиа + текст»: «Изображение с текстом»
 * (ImageWithText) и «Мультиряды» (MultiRows, чередование сторон по индексу).
 *
 * ЭТАЛОН — rose. Владелец 2026-09-15, дословно: «как пример работы можешь брать
 * у розы для всех багов темы». Замер rose (Chromium 1920, оба блока, обе стороны
 * чередования): доли медиа:текст = 1.000 при ВСЕХ трёх «Ширинах»
 * (370/370, 520/520, 640/640) и зазор 40px в каждой клетке. То есть жалоба —
 * НЕ про задумку блока: у эталона ни «соприкасания», ни связанных ширин нет.
 *
 * ЗАМЕР «ДО» (те же окна; пять тем × два блока × три «Ширины» × обе стороны =
 * 60 клеток на окно; рендер — скомпилированным модулем темы, CSS — тот же,
 * что в превью). Медиа/текст/зазор при «Ширина» small → large:
 *
 *   блок              тема     до правки                    расхождение с rose
 *   ImageWithText     rose     370/370/40 → 640/640/40      — эталон
 *   ImageWithText     vanilla  388/352/40 → 652/352/40      доли ПЛЫВУТ (1.102 → 1.852)
 *   ImageWithText     bloom    382/382/16 → 652/652/16      зазор 16 вместо 40
 *   ImageWithText     satin    390/390/ 0 → 660/660/ 0      зазора НЕТ
 *   ImageWithText     flux     370/370/40 → 620/620/40      — совпадает
 *   MultiRows         rose     370/370/40 → 640/640/40      — эталон
 *   MultiRows         vanilla  640/640/40 → 640/640/40      «Ширина» МЕРТВА
 *   MultiRows         bloom    382/382/16 → 652/652/16      зазор 16 вместо 40
 *   MultiRows         satin    370/370/40 → 640/640/40      — совпадает
 *   MultiRows         flux     374/374/32 → 624/624/32      зазор 32 вместо 40
 *
 * Отсюда три требования, каждое — от эталона rose, а не от вкуса:
 *   1) зазор пары равен зазору rose в том же блоке (40px) и не нулевой;
 *   2) колонки пары — РОВНО ПОЛОВИНЫ: ни одна не заморожена собственным
 *      потолком/базисом, иначе «Ширина» не масштабирует пару, а перекладывает
 *      место между медиа и контейнером (vanilla давала 388/352 против 652/352);
 *   3) «Ширина» жива: потолок контейнера при small ≠ потолок при large
 *      (vanilla/MultiRows давала 1320px на всех трёх значениях, потому что
 *      нелокализованный `.vanilla-container` перебивал утилиту max-w-*).
 *
 * Плюс четвёртое, инфраструктурное: каждый класс, который порт реально пишет в
 * разметку, обязан существовать в СОБСТВЕННОМ бандле темы. На живой витрине
 * другого CSS нет; а в превью недостающий класс подменяется соседним из
 * preview-tailwind.css, и конструктор показывает не то, что увидит покупатель
 * (так vanilla/«Мультиряды» показывали зазор 16px вместо живых 40px).
 *
 * ЧТО СТОРОЖИМ. Не наличие строки в исходнике, а ПОБЕДИТЕЛЯ КАСКАДА в реальных
 * собранных бандлах для реальных узлов реального рендера. Проверка «есть класс»
 * слепа: и утилиты Tailwind, и классы темы лежат рядом, и решают слой/порядок.
 *
 * Требует сборки (тот же порядок, что в CI):
 *   pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 *   && pnpm build:preview-tailwind
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parse, type HTMLElement } from "node-html-parser";

import { declaredValue, loadBundle, phantomClasses, pxOf, themeCss } from "../../../scripts/qa/lib";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const THEMES = ["rose", "vanilla", "bloom", "satin", "flux"] as const;
type Theme = (typeof THEMES)[number];
const BLOCKS = ["ImageWithText", "MultiRows"] as const;
type Block = (typeof BLOCKS)[number];
/** Десктопная опора замера: ширина окна, на которой сняты числа «до». */
const DESKTOP_PX = 1440;

// ─────────────────────────────── рендер ───────────────────────────────

const propsFor = (block: Block, width: "small" | "medium" | "large") =>
  block === "MultiRows"
    ? {
        id: "MultiRows-guard",
        colorScheme: "1",
        padding: { top: 40, bottom: 40 },
        width,
        size: "small",
        rowsPosition: "left",
        heading: "Мультиряды",
        alignment: "left",
        rows: [
          {
            id: "row-1",
            title: "Ряд 1",
            description: "Текст ряда",
            image: "",
            size: "small",
            headingSize: "small",
            textSize: "small",
            button: { text: "Кнопка", link: "/catalog" },
          },
        ],
      }
    : {
        id: "ImageWithText-guard",
        colorScheme: "1",
        padding: { top: 40, bottom: 40 },
        width,
        size: "medium",
        imagePosition: "left",
        image: { url: "", alt: "" },
        heading: "Изображение с текстом",
        text: "Покажи и расскажи о своем товаре в одном блоке",
        button: { text: "Кнопка", href: "/about" },
        alignment: "left",
      };

const htmlCache = new Map<string, string>();

function renderPair(theme: Theme, block: Block, width: "small" | "medium" | "large"): string {
  const key = `${theme}/${block}/${width}`;
  const ready = htmlCache.get(key);
  if (ready !== undefined) return ready;
  const jobs = [{ block, cascade: true, live: true, props: propsFor(block, width) }];
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const row = (JSON.parse(raw) as Record<string, string>[])[0];
  if (row.html === undefined) {
    throw new Error(
      `рендер ${block} (${theme}, ширина ${width}) не дал HTML: ${JSON.stringify(row).slice(0, 300)}`,
    );
  }
  htmlCache.set(key, row.html);
  return row.html;
}

// ─────────────────────── поиск пары в разметке ───────────────────────

const elementChildren = (el: HTMLElement): HTMLElement[] =>
  el.childNodes.filter(
    (n): n is HTMLElement => (n as HTMLElement).tagName !== undefined,
  );

const looksLikeMedia = (el: HTMLElement): boolean =>
  /aspect-/.test(el.getAttribute("class") ?? "") ||
  el.querySelector("img") !== null ||
  el.tagName === "IMG";

/**
 * Пара = САМЫЙ ВНЕШНИЙ узел с ровно двумя элементами-детьми, один из которых
 * несёт медиа. У «Мультирядов» приоритет у явной разметки ряда: её кладёт
 * конструктор, и на неё же смотрит превью.
 */
function findPair(root: HTMLElement): HTMLElement {
  const rows = root.querySelectorAll('[data-puck-subsection-field="rows"]');
  if (rows.length) return rows[0];
  const queue: HTMLElement[] = [root];
  while (queue.length) {
    const el = queue.shift() as HTMLElement;
    const kids = elementChildren(el);
    if (kids.length === 2 && kids.some(looksLikeMedia)) return el;
    queue.push(...kids);
  }
  throw new Error("пара «медиа + текст» в разметке не найдена");
}

function pairParts(theme: Theme, block: Block, width: "small" | "medium" | "large") {
  const section = parse(renderPair(theme, block, width));
  const root =
    section.querySelector("[data-puck-component-id]") ??
    (section.firstChild as HTMLElement);
  const pair = findPair(root);
  const kids = elementChildren(pair);
  const media = kids.find(looksLikeMedia) ?? kids[0];
  const text = kids.find((k) => k !== media) as HTMLElement;
  // Предки пары — на них висит потолок ширины («Ширина» секции).
  const ancestors: HTMLElement[] = [];
  let node: HTMLElement | null = pair;
  while (node && node !== root) {
    ancestors.push(node);
    node = node.parentNode as HTMLElement | null;
  }
  if (node === root) ancestors.push(root);
  return { root, pair, media, text, ancestors };
}

const classesOf = (el: HTMLElement): string[] =>
  (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

// ───────────────── каскад по бандлам: общая библиотека ─────────────────

/**
 * Победителя каскада считает общий движок (`scripts/qa/lib/bundle.ts` поверх
 * `src/themes/__tests__/lib/css-cascade.ts`): слои → специфичность → порядок →
 * инлайн. Собственной копии движка у этого гарда больше нет: две копии
 * разъезжаются, и первым же расхождением станет зелёная проверка там, где в
 * браузере победил бы кто-то другой.
 */
const bundleOf = (theme: Theme, withPreview = true) => loadBundle(theme, { withPreview });

const gapPx = (theme: Theme, el: HTMLElement, withPreview = true): number | null =>
  pxOf(bundleOf(theme, withPreview), el, ["column-gap", "gap"], DESKTOP_PX);

const maxWidthPx = (theme: Theme, el: HTMLElement): number | null =>
  pxOf(bundleOf(theme), el, ["max-width"], DESKTOP_PX);

const declared = (theme: Theme, el: HTMLElement, props: readonly string[]): string | null =>
  declaredValue(bundleOf(theme), el, props, DESKTOP_PX)?.value ?? null;

// ───────────────────────────── проверки ─────────────────────────────

describe("пара «медиа + текст»: зазор, доли колонок, живая «Ширина»", () => {
  describe("1) зазор пары равен зазору эталона rose", () => {
    for (const block of BLOCKS) {
      const reference = () => {
        const { pair } = pairParts("rose", block, "large");
        return gapPx("rose", pair);
      };
      for (const theme of THEMES) {
        it(`${theme} / ${block}: тот же зазор, что у rose, и не ноль`, () => {
          const { pair } = pairParts(theme, block, "large");
          const gap = gapPx(theme, pair);
          const rose = reference();
          expect({ theme, block, gap }).toEqual({ theme, block, gap: rose });
          expect(gap as number).toBeGreaterThan(0);
        });
      }
    }
  });

  describe("2) колонки пары — ровно половины", () => {
    for (const theme of THEMES) {
      for (const block of BLOCKS) {
        it(`${theme} / ${block}: ни медиа, ни контейнер не забирают чужую долю`, () => {
          const { pair, media, text } = pairParts(theme, block, "large");
          const recipe = (el: typeof media) => ({
            cap: maxWidthPx(theme, el),
            basis: declared(theme, el, ["flex-basis"]),
            grow: declared(theme, el, ["flex-grow", "flex"]),
            width: declared(theme, el, ["width"]),
          });
          // Грид: две дорожки обязаны быть ОДИНАКОВЫМИ (repeat(2, …)).
          const template = declared(theme, pair, ["grid-template-columns"]);
          if (template !== null) {
            expect({ theme, block, template }).toEqual({
              theme,
              block,
              template: expect.stringMatching(/^repeat\(\s*2\s*,/),
            });
          }
          expect({ theme, block, ...recipe(media) }).toEqual({
            theme,
            block,
            ...recipe(text),
          });
        });
      }
    }
  });

  describe("3) «Ширина» жива", () => {
    for (const theme of THEMES) {
      for (const block of BLOCKS) {
        it(`${theme} / ${block}: small и large дают разный потолок контейнера`, () => {
          const capOf = (w: "small" | "large") => {
            const { ancestors } = pairParts(theme, block, w);
            const caps = ancestors
              .map((el) => maxWidthPx(theme, el))
              .filter((v): v is number => v !== null);
            return caps.length ? Math.min(...caps) : null;
          };
          const small = capOf("small");
          const large = capOf("large");
          expect({ theme, block, small, large }).toEqual({
            theme,
            block,
            small: expect.any(Number),
            large: expect.any(Number),
          });
          expect(small).not.toBe(large);
        });
      }
    }
  });

  describe("4) в разметке пары нет классов-призраков", () => {
    /**
     * Класс, которого нет в СОБСТВЕННОМ бандле темы, — тихий ноль: на живой
     * витрине другого CSS нет, а в превью его подменяет соседний класс из
     * preview-tailwind.css, и конструктор показывает не то, что увидит
     * покупатель. Поймано дважды за одну смену: (1) vanilla/«Мультиряды»
     * показывали зазор 16px вместо живых 40px — в бандле темы не было
     * `md:gap-10`, потому что в global.css не хватало `@source ../components`;
     * (2) `lg:basis-1/2` и `lg:basis-full` НЕ генерируются в этой сборке вовсе
     * (в бандле ноль вхождений «basis») — класс стоял в разметке и не делал
     * ничего.
     */
    const MARKERS = /^(group|peer|color-scheme-\d+|sr-only|[a-z]+-(pad|page))$/;
    for (const theme of THEMES) {
      for (const block of BLOCKS) {
        it(`${theme} / ${block}: каждый класс пары есть в бандле темы`, () => {
          const { pair, media, text } = pairParts(theme, block, "large");
          // Бандл БЕЗ превью: на живой витрине другого CSS нет.
          const phantom = phantomClasses(themeCss(theme), [pair, media, text].flatMap(classesOf), {
            ignore: MARKERS,
          });
          expect({ theme, block, phantom }).toEqual({
            theme,
            block,
            phantom: [],
          });
        });
      }
    }
  });
});
