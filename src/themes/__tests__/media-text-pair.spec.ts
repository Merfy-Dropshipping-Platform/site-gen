/**
 * Пара «медиа + текст»: зазор, доли колонок, живая «Ширина».
 *
 * Секция — семья «медиа + текст»: «Изображение с текстом» (ImageWithText) и
 * «Мультиряды» (MultiRows, чередование сторон по индексу). У ДВУХ блоков —
 * РАЗНЫЙ канон (разбор владельца по каждому — раздельный, см. ниже), и с
 * 2026-09-17 они больше не проверяются одной и той же геометрией.
 *
 * ── ImageWithText: канон эталона rose (жалоба владельца 2026-09-15) ──
 * «Контейнер и медиа соприкасаются» — для ЭТОГО блока эталон rose (owner,
 * 2026-09-15: «как пример работы можешь брать у розы для всех багов темы»)
 * показал: доли медиа:текст = 1.000 при ВСЕХ трёх «Ширинах» (370/370, 520/520,
 * 640/640) и зазор 40px в каждой клетке — то есть у ЭТОГО блока ни
 * «соприкасания», ни связанных с «Шириной» долей нет, только скейл пары
 * целиком. До правки 2026-09-15 расходились: vanilla (доли ПЛЫВУТ 1.102→1.852),
 * bloom (зазор 16 вместо 40), satin (зазора НЕТ). ImageWithText в РАМКАХ ЭТОГО
 * файла НЕ меняется задачей 2026-09-17 — требования 1-2 ниже остаются его
 * канон без изменений.
 *
 * ── MultiRows: канон 2026-09-17 (НОВАЯ жалоба, отменяет канон 2026-09-15) ──
 * Владелец, 2026-09-17, дословно (со скриншотами): «Мультиряды размерность
 * контейнера поправить... контейнер и медиа соприкасаются, если медиа
 * маленького размера, контейнер берёт на себя больше места и так же
 * наоборот». Наш вид на скриншоте ДО — ровно rose-канон 2026-09-15 (две
 * плитки со скруглением, зазор 40, доли 1.000 при любой «Ширине») — и он
 * оказался НЕПРАВИЛЬНЫМ для этого блока: владелец показал чужой редактор, где
 * медиа и текст стыкуются БЕЗ зазора и без скругления на внутренней границе, а
 * «Ширина» двигает ДОЛЮ медиа (small уже, medium ≈ половина, large шире).
 * Значит для MultiRows старый rose-канон (пункты 1-2 старой версии этого
 * файла) был диагнозом самой жалобы, а не эталоном — правило «сверяться с
 * rose» здесь неприменимо, потому что rose сам был багом.
 *
 * Замер «до» (реальный Chromium 1920, pnpm exec tsx через playwright,
 * компилированный модуль темы — тот же, что уходит на витрину): ВСЕ пять тем
 * давали 370/370/40 → 520/520/40 → 640/640/40 (rose/vanilla/bloom/satin;
 * flux — 374/374/40 → 624/624/40, потолок секции чуть теснее) — то есть сам
 * баг был идентичен на всех пяти темах, «Ширина» меняла только общий масштаб
 * пары, а не долю медиа.
 *
 * Правка (эта задача): widthCls (потолок ряда 780/1080/1320) НЕ трогаем — он
 * уже жил (см. требование 3). ДОБАВЛЕНО: тот же проп «Ширина» задаёт ДОЛЮ
 * медиа через `grid-template-columns` пары — small 2fr:3fr (медиа 40%),
 * medium 1fr:1fr (медиа ≈ половина — точка опоры владельца), large 3fr:2fr
 * (медиа 60%); зазор ряда на брейкпоинте, где пара становится двухколоночной
 * (lg: у rose/vanilla/bloom/flux, md: у satin), обнулён; скругление медиа —
 * ТОЛЬКО на внешних углах (rounded-l/rounded-r), на стыке — `rounded-*-none`.
 *
 * Отсюда для MultiRows ТРИ НОВЫХ требования (описаны в блоках 1-2 и 5 ниже):
 *   1) зазор пары РОВНО НОЛЬ (не «как у rose» — у rose теперь тоже ноль);
 *   2) «Ширина» меняет ДОЛЮ медиа в `grid-template-columns`: small уже text,
 *      large шире text, medium — паритет (обе доли равны);
 *   5) скругление медиа на стороне СТЫКА с текстом — ноль, на внешней — нет.
 *
 * Требование 3 («Ширина» жива — потолок контейнера small ≠ large) — ОБЩЕЕ для
 * обоих блоков и НЕ менялось: widthCls остался прежним для обоих.
 *
 * Плюс четвёртое, инфраструктурное (тоже общее): каждый класс, который порт
 * реально пишет в разметку, обязан существовать в СОБСТВЕННОМ бандле темы. На
 * живой витрине другого CSS нет; а в превью недостающий класс подменяется
 * соседним из preview-tailwind.css, и конструктор показывает не то, что
 * увидит покупатель (так vanilla/«Мультиряды» показывали зазор 16px вместо
 * живых 40px до правки 2026-09-15).
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

const propsFor = (
  block: Block,
  width: "small" | "medium" | "large",
  rowsPosition: "left" | "right" = "left",
) =>
  block === "MultiRows"
    ? {
        id: "MultiRows-guard",
        colorScheme: "1",
        padding: { top: 40, bottom: 40 },
        width,
        size: "small",
        rowsPosition,
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

function renderPair(
  theme: Theme,
  block: Block,
  width: "small" | "medium" | "large",
  rowsPosition: "left" | "right" = "left",
): string {
  const key = `${theme}/${block}/${width}/${rowsPosition}`;
  const ready = htmlCache.get(key);
  if (ready !== undefined) return ready;
  const jobs = [{ block, cascade: true, live: true, props: propsFor(block, width, rowsPosition) }];
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

function pairParts(
  theme: Theme,
  block: Block,
  width: "small" | "medium" | "large",
  rowsPosition: "left" | "right" = "left",
) {
  const section = parse(renderPair(theme, block, width, rowsPosition));
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

/**
 * MultiRows: доли `grid-template-columns` пары как [first, second] (fr).
 * В фикстуре гарда ряд одиночный (i=0); при rowsPosition="left" media стоит
 * ПЕРВОЙ дорожкой (DOM-порядок = порядок отрисовки), при "right" — второй
 * (медиа получает `order-2`/`md:order-2`, текст остаётся `order:0`, и грид
 * кладёт элементы в order-modified порядке — см. MultiRows.astro комментарий
 * «Владелец 2026-09-17» в порту темы). Значит first/second — это буквально
 * дорожки СЛЕВА/СПРАВА, а какая из них медиа — знает вызывающий код (он же
 * передал rowsPosition).
 */
function gridTemplateFrs(
  theme: Theme,
  width: "small" | "medium" | "large",
  rowsPosition: "left" | "right" = "left",
): { first: number; second: number } {
  const { pair } = pairParts(theme, "MultiRows", width, rowsPosition);
  const tpl = declared(theme, pair, ["grid-template-columns"]);
  const m = tpl?.match(/^(\d+(?:\.\d+)?)fr\s+(\d+(?:\.\d+)?)fr$/);
  if (!m) {
    throw new Error(
      `MultiRows (${theme}, ширина ${width}, ${rowsPosition}): grid-template-columns пары не в виде "Nfr Mfr": ${JSON.stringify(tpl)}`,
    );
  }
  return { first: Number(m[1]), second: Number(m[2]) };
}

// ───────────────────────────── проверки ─────────────────────────────

describe("пара «медиа + текст»: зазор, доли колонок, живая «Ширина»", () => {
  describe("1) зазор пары", () => {
    // ImageWithText — канон rose 2026-09-15 без изменений: зазор ПАРЫ равен
    // зазору rose (40px) и не нулевой (см. докстринг файла).
    const reference = () => {
      const { pair } = pairParts("rose", "ImageWithText", "large");
      return gapPx("rose", pair);
    };
    // bloom с 2026-09-22 из этого канона ВЫВЕДЕН. Владелец, дословно: «и в
    // мобиле не должно быть отступов если нет наложения, то есть и в
    // десктопе; в мобиле вертикального между ними». На присланном референсе
    // Shopify медиа и текст стыкуются вплотную: пара 1231, текст 834, медиа
    // 395 — в сумме ровно 1231. Остальные четыре темы держат прежние 40px.
    for (const theme of THEMES.filter((t) => t !== "bloom")) {
      it(`${theme} / ImageWithText: тот же зазор, что у rose, и не ноль`, () => {
        const { pair } = pairParts(theme, "ImageWithText", "large");
        const gap = gapPx(theme, pair);
        const rose = reference();
        expect({ theme, gap }).toEqual({ theme, gap: rose });
        expect(gap as number).toBeGreaterThan(0);
      });
    }
    it("bloom / ImageWithText: зазор пары РОВНО ноль (медиа и плашка стыкуются)", () => {
      const { pair } = pairParts("bloom", "ImageWithText", "large");
      expect({ gap: gapPx("bloom", pair) }).toEqual({ gap: 0 });
    });
    // MultiRows — канон 2026-09-17: медиа и текст СТЫКУЮТСЯ, зазор РОВНО ноль
    // на всех трёх «Ширинах» (не «как у rose» — у rose теперь тоже ноль).
    for (const theme of THEMES) {
      for (const width of ["small", "medium", "large"] as const) {
        it(`${theme} / MultiRows (${width}): зазор пары РОВНО ноль (медиа и текст стыкуются)`, () => {
          const { pair } = pairParts(theme, "MultiRows", width);
          const gap = gapPx(theme, pair);
          expect({ theme, width, gap }).toEqual({ theme, width, gap: 0 });
        });
      }
    }
  });

  describe("2) доли колонок", () => {
    // ImageWithText — канон rose 2026-09-15 без изменений: колонки ровно
    // половины на любой «Ширине» (в фикстуре гарда проверяется large).
    for (const theme of THEMES) {
      it(`${theme} / ImageWithText: ни медиа, ни контейнер не забирают чужую долю`, () => {
        const { pair, media, text } = pairParts(theme, "ImageWithText", "large");
        const recipe = (el: typeof media) => ({
          cap: maxWidthPx(theme, el),
          basis: declared(theme, el, ["flex-basis"]),
          grow: declared(theme, el, ["flex-grow", "flex"]),
          width: declared(theme, el, ["width"]),
        });
        const template = declared(theme, pair, ["grid-template-columns"]);
        if (template !== null) {
          expect({ theme, template }).toEqual({
            theme,
            template: expect.stringMatching(/^repeat\(\s*2\s*,/),
          });
        }
        expect({ theme, ...recipe(media) }).toEqual({ theme, ...recipe(text) });
      });
    }

    // MultiRows — канон 2026-09-17: «Ширина» двигает ДОЛЮ медиа в паре, а не
    // общий потолок ряда (тот проверяет требование 3 — он не менялся).
    // small — медиа УЖЕ текста; medium — доли РАВНЫ (опорная точка владельца
    // «средняя ≈ половина»); large — медиа ШИРЕ текста; small ≠ large (иначе
    // «Ширина» опять мертва для доли, пусть потолок и живой).
    for (const theme of THEMES) {
      it(`${theme} / MultiRows: «Ширина» двигает долю медиа (small уже, medium=половина, large шире)`, () => {
        const small = gridTemplateFrs(theme, "small");
        const medium = gridTemplateFrs(theme, "medium");
        const large = gridTemplateFrs(theme, "large");
        // rowsPosition="left" (фикстура) → media = первая дорожка (first).
        expect({ theme, width: "small", mediaFr: small.first, textFr: small.second }).toEqual({
          theme,
          width: "small",
          mediaFr: expect.any(Number),
          textFr: expect.any(Number),
        });
        expect(small.first).toBeLessThan(small.second);
        expect(medium.first).toBe(medium.second);
        expect(large.first).toBeGreaterThan(large.second);
        expect(small.first / small.second).not.toBe(large.first / large.second);
      });

      it(`${theme} / MultiRows: доля медиа зеркалится с rowsPosition="right"`, () => {
        // Медиа теперь ВТОРАЯ дорожка (текст первой) — доли те же, стороны
        // поменялись местами. Ловит регресс порядка "order" (см. MultiRows.astro).
        const leftSmall = gridTemplateFrs(theme, "small", "left");
        const rightSmall = gridTemplateFrs(theme, "small", "right");
        expect({ theme, media: rightSmall.second, text: rightSmall.first }).toEqual({
          theme,
          media: leftSmall.first,
          text: leftSmall.second,
        });
      });
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

  describe("5) MultiRows: скругление медиа — только на внешней стороне", () => {
    /**
     * Требование владельца 2026-09-17: «без скруглений на внутренней
     * границе». Медиа держит скругление радиуса темы на ВНЕШНЕЙ стороне (там,
     * где ряд граничит с полем секции) и НОЛЬ на стороне СТЫКА с текстом —
     * иначе стык снова читается как две отдельные плитки, даже если зазор уже
     * ноль. rowsPosition="left" (фикстура) → медиа слева → стык справа
     * (border-*-right-radius = 0, border-*-left-radius > 0 ИЛИ отсутствует
     * объявление совсем — у satin/vanilla радиус темы 0px, скруглять нечего).
     */
    for (const theme of THEMES) {
      it(`${theme} / MultiRows: скругление у стыка (справа) — ноль, снаружи (слева) — не меньше`, () => {
        const { media } = pairParts(theme, "MultiRows", "large");
        // Лонгхенд (наш directional override, lg:rounded-{l,r}-*) ищем ПЕРВЫМ —
        // он бьёт конкретный угол; если его нет вовсе (регресс убрал override и
        // остался только базовый `rounded-[var(--radius-media)]`), откатываемся
        // на шорткат `border-radius` — иначе отсутствующий лонгхенд молча
        // читается как 0 и маскирует ровно ту порчу, которую гард обязан ловить
        // (поймано саботажем: убрали override → тест остался зелёным, пока не
        // добавили шорткат вторым кандидатом).
        const seamPx = (long: string) =>
          pxOf(bundleOf(theme, false), media, [long, "border-radius"], DESKTOP_PX) ?? 0;
        const seamTop = seamPx("border-top-right-radius");
        const seamBottom = seamPx("border-bottom-right-radius");
        const outerTop = seamPx("border-top-left-radius");
        const outerBottom = seamPx("border-bottom-left-radius");
        expect({ theme, seamTop, seamBottom }).toEqual({ theme, seamTop: 0, seamBottom: 0 });
        // Внешняя сторона не обязана быть > 0 (satin/vanilla — радиус темы
        // 0px), но обязана быть >= стыка — регресс "весь rounded-none" не проходит.
        expect(outerTop).toBeGreaterThanOrEqual(seamTop);
        expect(outerBottom).toBeGreaterThanOrEqual(seamBottom);
      });
    }
  });

  describe("6) MultiRows: текстовый контейнер (containerColorScheme) — тот же запрет скругления на стыке", () => {
    /**
     * Владелец перепроверил 2026-09-17 (b70): пункт 5 выше сторожил ТОЛЬКО
     * медиа — у текстового контейнера (проп `containerColorScheme`, задаёт
     * bg/text/rounded-[var(--radius-card)] на текстовой колонке ряда) радиус
     * был ОДНИМ классом на все ряды, без учёта стороны стыка. На стыке рядом
     * с медиа (у которого стык уже был квадратным) текстовый контейнер
     * оставался скруглённым — ровно щель в форме скругления со скриншотов
     * владельца («у картинки свой радиус, у карточки свой»). Тут — то же
     * измерение, что в §5, но для второго элемента пары: сторона СТЫКА текста
     * с медиа обязана быть 0, независимо от rowsPosition (лево/право).
     */
    const propsForContainerScheme = (rowsPosition: "left" | "right") => ({
      id: "MultiRows-container-guard",
      colorScheme: "1",
      containerColorScheme: "2",
      padding: { top: 40, bottom: 40 },
      width: "medium",
      size: "small",
      rowsPosition,
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
    });

    const containerHtmlCache = new Map<string, string>();
    const renderContainerPair = (theme: Theme, rowsPosition: "left" | "right"): string => {
      const key = `${theme}/MultiRows/containerScheme/${rowsPosition}`;
      const ready = containerHtmlCache.get(key);
      if (ready !== undefined) return ready;
      const jobs = [
        { block: "MultiRows", cascade: true, live: true, props: propsForContainerScheme(rowsPosition) },
      ];
      const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
        cwd: SITES_ROOT,
        encoding: "utf-8",
        maxBuffer: 64 * 1024 * 1024,
      });
      const row = (JSON.parse(raw) as Record<string, string>[])[0];
      if (row.html === undefined) {
        throw new Error(
          `рендер MultiRows (${theme}, containerScheme, ${rowsPosition}) не дал HTML: ${JSON.stringify(row).slice(0, 300)}`,
        );
      }
      containerHtmlCache.set(key, row.html);
      return row.html;
    };

    const containerTextEl = (theme: Theme, rowsPosition: "left" | "right"): HTMLElement => {
      const section = parse(renderContainerPair(theme, rowsPosition));
      const root =
        section.querySelector("[data-puck-component-id]") ?? (section.firstChild as HTMLElement);
      const pair = findPair(root);
      const kids = elementChildren(pair);
      const media = kids.find(looksLikeMedia) ?? kids[0];
      return kids.find((k) => k !== media) as HTMLElement;
    };

    for (const theme of THEMES) {
      it(`${theme} / MultiRows: containerColorScheme слева (медиа слева) — стык у текста СЛЕВА, ноль`, () => {
        const text = containerTextEl(theme, "left");
        const seamPx = (long: string) =>
          pxOf(bundleOf(theme, false), text, [long, "border-radius"], DESKTOP_PX) ?? 0;
        // rowsPosition="left" → медиа слева, текст справа → стык текста слева.
        const seamTop = seamPx("border-top-left-radius");
        const seamBottom = seamPx("border-bottom-left-radius");
        const outerTop = seamPx("border-top-right-radius");
        const outerBottom = seamPx("border-bottom-right-radius");
        expect({ theme, seamTop, seamBottom }).toEqual({ theme, seamTop: 0, seamBottom: 0 });
        expect(outerTop).toBeGreaterThanOrEqual(seamTop);
        expect(outerBottom).toBeGreaterThanOrEqual(seamBottom);
      });

      it(`${theme} / MultiRows: containerColorScheme зеркалится с rowsPosition="right" — стык у текста СПРАВА, ноль`, () => {
        const text = containerTextEl(theme, "right");
        const seamPx = (long: string) =>
          pxOf(bundleOf(theme, false), text, [long, "border-radius"], DESKTOP_PX) ?? 0;
        // rowsPosition="right" → медиа справа, текст слева → стык текста справа.
        const seamTop = seamPx("border-top-right-radius");
        const seamBottom = seamPx("border-bottom-right-radius");
        expect({ theme, seamTop, seamBottom }).toEqual({ theme, seamTop: 0, seamBottom: 0 });
      });
    }
  });
});
