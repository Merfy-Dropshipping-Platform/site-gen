/**
 * Счётчик количества на странице товара берёт оформление СВОЕЙ темы.
 *
 * Баг-репорт тестировщика 2026-09-14, 02:07:
 *   «Счётчик количества товара применяется единый. Ожидаемый результат: брать
 *    из темы, в Rose это плашка, в Flux как раз пустота и нет обводки и плашки,
 *    в Bloom тоже плашка скруглена, в Satin плашка, в Vanilla две плашки именно
 *    у плюса и минуса».
 *
 * ЗАМЕР «ДО» (chromium 1440px, реальный CSS темы + buildTokensCss, 2026-09-14).
 * Страница товара `/product` во ВСЕХ пяти темах рендерится общим
 * `theme-base/blocks/Product/Product.astro` (PRODUCT_UNIFIED_THEMES), кроме
 * flux — у него собственный порт секции (sections.map.json: Product →
 * FeaturedProduct.astro). HTML секции у rose/bloom/satin/vanilla совпадал
 * ПОБАЙТОВО (md5 d680c42f…), и счётчик у всех четырёх был один:
 *
 *   коробка  фон прозрачный, рамка 0px, радиус 0px, 96×24…25.6
 *   кнопки   24×24, фон прозрачный, радиус 0px
 *
 * flux при этом уже рисовал ровно то, что тестировщик и называет эталоном
 * «пустоты»: коробка 136×44 без фона и рамки, кнопки 44×44 без заливки.
 * Ровно об этом жалоба: четыре темы носили один чужой вид.
 *
 * ОТКУДА ВЗЯТО ОФОРМЛЕНИЕ (собственный код темы, не выдумка):
 *   rose     `themes/rose/src/components/sections/CartBody.astro` — счётчик
 *            строки корзины: `inline-flex h-10 items-center
 *            rounded-[var(--radius-input,8px)] border border-solid`, кнопки
 *            40×40, число `min-w-[28px]`. Цвет рамки — токеном
 *            `rgb(var(--color-border,…))`, как в счётчике карточки коллекции
 *            (`themes/rose/src/components/sections/Popular.astro`).
 *   bloom    `themes/bloom/src/components/products/BloomProductDetail.astro` —
 *            `h-10 w-fit rounded-[4px] border`, кнопки 40×40, иконки 16px.
 *            Скругление 4px = ровно `--radius-input` темы bloom.
 *   satin    `themes/satin/src/components/products/satinProductDetail.astro` —
 *            коробка с рамкой без скругления; `--radius-input` satin = 0px.
 *   vanilla  `themes/vanilla/src/components/products/VanillaProductDetail.astro` —
 *            коробки НЕТ, зато у каждой кнопки своя плашка
 *            `size-6 bg-[var(--vanilla-header-bg)]` с белой иконкой. Сама
 *            переменная объявлена в `themes/vanilla/src/styles/global.css:99`
 *            как `rgb(var(--color-button-bg, var(--color-heading)))` — то есть
 *            плашка vanilla это и есть цвет кнопки схемы.
 *   flux     `themes/flux/src/components/sections/FeaturedProduct.astro` —
 *            `inline-flex w-fit items-center gap-3`, ни фона, ни рамки.
 *
 * Новых токенов не заводится, состав панели не меняется: вариант живёт в
 * `theme.json blockDefaults.Product.visualConfig.counter.variant` — это
 * layout-переключатель темы, в конструкторе для него полей нет.
 *
 * ПОЧЕМУ ПРОВЕРКА СЧИТАЕТ ЦВЕТ/РАДИУС, А НЕ ИЩЕТ КЛАСС. Темы доставляют
 * оформление этого контрола тремя разными механизмами (токен-утилита, литерал
 * в классе, CSS-переменная темы), поэтому «в HTML есть border» зелено на одной
 * теме и слепо на остальных. Считается то же, что показывает
 * getComputedStyle: победитель каскада среди утилит узла в РЕАЛЬНОМ
 * `dist/theme-css/<тема>.css` + числа токенов из `buildTokensCss`. Браузера в
 * CI нет, поэтому резолвер откалиброван по настоящему Chromium: на 10 парах
 * (5 тем × 2 места) он даёт те же числа, что браузер (замер 2026-09-14).
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { migrateRevisionData } from "../../utils/revision-migrations";
import { buildTokensCss } from "../tokens-css";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
type Theme = (typeof THEMES)[number];

/** Узлы счётчика во всех трёх разметках: theme-base, порт flux, порты PDP. */
const BOX_MARKERS = ["data-product-counter", "data-cfg-qty", "data-pdp-qty"];
const DEC_MARKERS = [
  'data-counter-action="decrement"',
  "data-cfg-qty-dec",
  'data-action="qty-dec"',
];

// ───────────────────────────────────────────────────────────────────────────
// Мини-каскад: победитель среди утилит одного узла.
//
// Все утилиты Tailwind — селекторы из одного класса, специфичность у них
// одинаковая, значит выигрывает та, что объявлена в файле НИЖЕ. Поэтому ищем
// правило каждого класса в реальном CSS темы и берём то, чьё объявление стоит
// дальше по файлу. Порядок классов в атрибуте на это не влияет — и проверка
// не должна на него опираться.
// ───────────────────────────────────────────────────────────────────────────

const cssSelectorOf = (cls: string) =>
  `.${cls.replace(/[.[\]()#/%,:!*+~='"^$&{}|<>?\\]/g, (ch) => `\\${ch}`)}`;
const forRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Значение свойства `prop` у узла с такими классами (или null). */
function winningDecl(
  themeCss: string,
  classes: string[],
  prop: string,
): string | null {
  let best: { at: number; value: string } | null = null;
  for (const cls of classes) {
    const re = new RegExp(
      `${forRegExp(cssSelectorOf(cls))}\\s*\\{([^}]*)\\}`,
      "g",
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(themeCss))) {
      const decl = new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`).exec(m[1]);
      if (!decl) continue;
      if (!best || m.index > best.at) {
        best = { at: m.index, value: decl[1].trim() };
      }
    }
  }
  return best?.value ?? null;
}

/**
 * Числа токенов ровно там, где их берёт браузер: `:root` (последнее
 * объявление выигрывает), поверх — блок активной схемы секции
 * `.color-scheme-<N>`.
 *
 * Брать «последнее объявление токена в файле» НЕЛЬЗЯ: схем в tokens.css пять,
 * и последней окажется пятая. У vanilla это разные числа — `--color-button-bg`
 * в `:root` 17 17 17, а в схеме 1 (её и рисует секция) 58 69 48. Chromium
 * показывает 58 69 48; проверка, считающая по файлу, была бы зелёной с чужим
 * числом.
 */
function tokenMap(tokensCss: string, scheme: string): Map<string, string> {
  const map = new Map<string, string>();
  const blocks = /([^{}]+)\{([^}]*)\}/g;
  const wanted = [":root", `.color-scheme-${scheme}`];
  for (const sel of wanted) {
    blocks.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = blocks.exec(tokensCss))) {
      if (m[1].trim() !== sel) continue;
      for (const decl of m[2].split(";")) {
        const kv = /^\s*(--[a-z0-9-]+):\s*(.+)$/i.exec(decl);
        if (kv) map.set(kv[1], kv[2].trim());
      }
    }
  }
  return map;
}

/**
 * Подстановка значений токенов — то же, что делает браузер, применяя
 * переменные :root и активной схемы.
 */
function substituteTokens(value: string, tokens: Map<string, string>): string {
  let out = value;
  for (let i = 0; i < 5 && /var\(--/.test(out); i += 1) {
    out = out.replace(
      /var\((--[a-z0-9-]+)(?:,\s*([^()]*))?\)/gi,
      (_, token: string, fallback: string | undefined) =>
        tokens.get(token) ?? fallback ?? "",
    );
  }
  // Спейсинг Tailwind: calc(var(--spacing) * 10) уже развёрнут подстановкой.
  const calc = /^calc\(\s*([\d.]+)(rem|px)\s*\*\s*([\d.]+)\s*\)$/.exec(out);
  if (calc) {
    const unit = calc[2] === "rem" ? 16 : 1;
    return `${Number(calc[1]) * unit * Number(calc[3])}px`;
  }
  return out;
}

/** Пиксели из значения вида `8px` / `0px` / `4px` (иначе null). */
const px = (v: string | null): number | null => {
  if (!v) return null;
  const m = /^([\d.]+)px$/.exec(v.trim());
  if (m) return Number(m[1]);
  const rem = /^([\d.]+)rem$/.exec(v.trim());
  return rem ? Number(rem[1]) * 16 : null;
};

/**
 * Заливка/рамка «есть» — это не «свойство объявлено». `bg-transparent` и
 * `border-0` объявлены, но не рисуют ничего: именно так выглядел общий счётчик
 * до правки, и проверка «свойство есть» была бы на нём зелёной.
 */
const NOTHING = new Set([
  "transparent",
  "rgba(0,0,0,0)",
  "rgba(0, 0, 0, 0)",
  "0px",
  "0",
]);
const paints = (v: string | null): boolean => v !== null && !NOTHING.has(v);

/** `17 17 17` → `rgb(17,17,17)`; `rgb(var(--x))` уже развёрнут. */
const rgb = (v: string | null): string | null => {
  if (!v) return null;
  const m = /^rgb\(\s*([\d]+)\s+([\d]+)\s+([\d]+)\s*\)$/.exec(v.trim());
  return m ? `rgb(${m[1]},${m[2]},${m[3]})` : v.trim();
};

// ───────────────────────────────────────────────────────────────────────────
// Разметка
// ───────────────────────────────────────────────────────────────────────────

const tagWith = (html: string, marker: string): string | null =>
  new RegExp(`<[a-z0-9]+[^>]*${forRegExp(marker)}[^>]*>`, "i").exec(
    html,
  )?.[0] ?? null;

function classesOfAny(html: string, markers: string[]): string[] {
  for (const marker of markers) {
    const tag = tagWith(html, marker);
    if (!tag) continue;
    return (/class="([^"]*)"/.exec(tag)?.[1] ?? "")
      .split(/\s+/)
      .filter(Boolean);
  }
  throw new Error(`ни один из узлов ${markers.join(", ")} не найден`);
}

/** Каталог магазина для тем, которые ходят за товарами HTTP-запросом. */
const CATALOG_STUB = resolve(__dirname, "storefront-data-stub.mjs");

/** Схема, которую рисует секция в этих проверках (она же в productProps). */
const SCHEME = "1";

const productProps = {
  id: "Product-1",
  productId: "",
  colorScheme: SCHEME,
  padding: { top: 40, bottom: 40 },
};

const built = (theme: Theme) =>
  existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  );

/**
 * Пропы блока «Товар» РОВНО ТЕ, что уходят на витрину: сид страницы товара
 * темы (`packages/theme-<t>/pages/product.json`), пропущенный через
 * `migrateRevisionData` — так его читает `extractPageBlocks` на каждой сборке.
 *
 * Без этого режима проверка меряет не тот путь. 14.09 гард был зелёный 27/27,
 * а на живой витрине rose счётчик остался прежним: сид rose пинит
 * `visualConfig` ВНУТРЬ данных мерчанта, а `renderBlock` мерджит
 * `deepMergeBlockProps(blockDefaults, props)` — пропы ревизии сильнее темы.
 * У bloom/satin/vanilla `visualConfig` в сиде нет, поэтому у них тема доезжала
 * и правка «работала» — расхождение пряталось ровно в одной теме.
 */
function seedProductProps(theme: Theme): Record<string, unknown> {
  const seedPath = resolve(
    SITES_ROOT,
    "packages",
    `theme-${theme}`,
    "pages",
    "product.json",
  );
  const raw = JSON.parse(readFileSync(seedPath, "utf8")) as
    | { type?: string; props?: Record<string, unknown> }[]
    | { content?: { type?: string; props?: Record<string, unknown> }[] };
  const content = Array.isArray(raw) ? raw : (raw.content ?? []);
  const migrated = migrateRevisionData(
    { pagesData: { "page-product": { content } } },
    theme,
  ) as {
    pagesData?: Record<
      string,
      { content?: { type?: string; props?: Record<string, unknown> }[] }
    >;
  };
  const page = migrated.pagesData?.["page-product"];
  const block = (page?.content ?? []).find((b) => b?.type === "Product");
  if (!block?.props) {
    throw new Error(`в сиде страницы товара ${theme} нет блока Product`);
  }
  return block.props;
}

/**
 * Рендер секции «Товар» ЛЕСТНИЦЕЙ витрины: порт темы → пакет темы → theme-base.
 * Именно ею секцию резолвит `defaultComponentResolver`, поэтому flux приходит
 * своим портом, а остальные четыре — общим блоком.
 *
 * `mode: "seed"` — пропы из сида страницы темы (то, что реально уходит в прод);
 * `mode: "bare"` — голая ревизия без `visualConfig` (тема обязана дать силуэт
 * и когда мерчант ничего не сохранял).
 */
function renderProduct(theme: Theme, mode: "seed" | "bare" = "seed"): string {
  const props =
    mode === "seed"
      ? { ...seedProductProps(theme), colorScheme: SCHEME }
      : productProps;
  const jobs = [{ block: "Product", props, cascade: true, live: true }];
  const raw = execFileSync(
    "node",
    ["--import", CATALOG_STUB, RENDERER, theme, JSON.stringify(jobs)],
    { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
  );
  const row = JSON.parse(raw)[0] as {
    html?: string;
    error?: string;
    missing?: boolean;
    pipelineError?: string;
  };
  if (row.html === undefined) {
    throw new Error(
      `рендер «Товар» (${theme}, ${mode}) не дал HTML: ${row.error ?? row.pipelineError ?? (row.missing ? "блока нет" : "?")}`,
    );
  }
  return row.html;
}

const themeCssOf = (theme: Theme): string => {
  const path = resolve(SITES_ROOT, "dist", "theme-css", `${theme}.css`);
  if (!existsSync(path)) {
    throw new Error(`нет ${path} — нужен pnpm build:theme-sections:all`);
  }
  return readFileSync(path, "utf8");
};

/** Эффективное оформление узла: фон, рамка, радиус. */
function surfaceOf(
  themeCss: string,
  tokens: Map<string, string>,
  classes: string[],
): {
  bg: string | null;
  borderWidth: number | null;
  borderColor: string | null;
  radius: number | null;
} {
  const sub = (v: string | null) =>
    v === null ? null : substituteTokens(v, tokens);
  return {
    bg: rgb(sub(winningDecl(themeCss, classes, "background-color"))),
    borderWidth: px(sub(winningDecl(themeCss, classes, "border-width"))),
    borderColor: rgb(sub(winningDecl(themeCss, classes, "border-color"))),
    radius: px(sub(winningDecl(themeCss, classes, "border-radius"))),
  };
}

/** Число токена темы — то же, что подставит браузер в активной схеме. */
const tokenValue = (
  tokens: Map<string, string>,
  token: string,
): string | null => tokens.get(token) ?? null;

// ───────────────────────────────────────────────────────────────────────────
// Ожидаемое оформление: «плашка» / «пустота» / «две плашки».
// ───────────────────────────────────────────────────────────────────────────

type Shape = "boxed" | "empty" | "split";
const EXPECTED: Record<Theme, Shape> = {
  rose: "boxed",
  bloom: "boxed",
  satin: "boxed",
  flux: "empty",
  vanilla: "split",
};

const MODES = ["seed", "bare"] as const;
type Mode = (typeof MODES)[number];
const MODE_LABEL: Record<Mode, string> = {
  seed: "сид страницы темы (путь витрины)",
  bare: "голая ревизия",
};

describe.each(
  THEMES.flatMap((theme) => MODES.map((mode) => [theme, mode] as const)),
)("счётчик количества «Товар» — %s, %s", (theme, mode) => {
  const tokens = tokenMap(buildTokensCss({}, theme), SCHEME);
  let boxClasses: string[] = [];
  let decClasses: string[] = [];

  beforeAll(() => {
    if (!built(theme)) return;
    const html = renderProduct(theme, mode);
    boxClasses = classesOfAny(html, BOX_MARKERS);
    decClasses = classesOfAny(html, DEC_MARKERS);
  }, 180_000);

  it(`секции темы собраны (${MODE_LABEL[mode]})`, () => {
    expect(built(theme)).toBe(true);
  });

  const shape = EXPECTED[theme];

  if (shape === "boxed") {
    it("плашка: коробка обведена рамкой цвета --color-border", () => {
      if (!built(theme)) return;
      const box = surfaceOf(themeCssOf(theme), tokens, boxClasses);
      expect({ рамка: box.borderWidth, цвет: box.borderColor }).toEqual({
        рамка: 1,
        цвет: rgb(`rgb(${tokenValue(tokens, "--color-border")})`),
      });
    });

    it("плашка: скругление — «своё» темы (--radius-input)", () => {
      if (!built(theme)) return;
      const box = surfaceOf(themeCssOf(theme), tokens, boxClasses);
      expect(box.radius).toBe(px(tokenValue(tokens, "--radius-input")));
    });

    it("плашка одна: у кнопок собственной заливки нет", () => {
      if (!built(theme)) return;
      const dec = surfaceOf(themeCssOf(theme), tokens, decClasses);
      expect({ заливка: paints(dec.bg), рамка: !!dec.borderWidth }).toEqual({
        заливка: false,
        рамка: false,
      });
    });
  }

  if (shape === "empty") {
    it("пустота: ни фона, ни рамки у коробки", () => {
      if (!built(theme)) return;
      const box = surfaceOf(themeCssOf(theme), tokens, boxClasses);
      expect({ фон: paints(box.bg), рамка: !!box.borderWidth }).toEqual({
        фон: false,
        рамка: false,
      });
    });

    it("пустота: у кнопок тоже ни фона, ни рамки", () => {
      if (!built(theme)) return;
      const dec = surfaceOf(themeCssOf(theme), tokens, decClasses);
      expect({ фон: paints(dec.bg), рамка: !!dec.borderWidth }).toEqual({
        фон: false,
        рамка: false,
      });
    });
  }

  if (shape === "split") {
    it("две плашки: у кнопки «−» своя заливка цветом кнопки схемы", () => {
      if (!built(theme)) return;
      const dec = surfaceOf(themeCssOf(theme), tokens, decClasses);
      expect(dec.bg).toBe(
        rgb(`rgb(${tokenValue(tokens, "--color-button-bg")})`),
      );
    });

    it("две плашки: общей коробки вокруг счётчика нет", () => {
      if (!built(theme)) return;
      const box = surfaceOf(themeCssOf(theme), tokens, boxClasses);
      expect({ фон: paints(box.bg), рамка: !!box.borderWidth }).toEqual({
        фон: false,
        рамка: false,
      });
    });
  }
});

/**
 * Главная проверка жалобы: «счётчик применяется единый». Оформление пяти тем
 * обязано быть РАЗНЫМ хотя бы по трём силуэтам — плашка / пустота / две плашки.
 */
it("пять тем дают три разных силуэта счётчика, а не один на всех", () => {
  const missing = THEMES.filter((t) => !built(t));
  expect(missing).toEqual([]);
  const silhouettes = new Set(
    THEMES.map((theme) => {
      const tokens = tokenMap(buildTokensCss({}, theme), SCHEME);
      const themeCss = themeCssOf(theme);
      const html = renderProduct(theme, "seed");
      const box = surfaceOf(themeCss, tokens, classesOfAny(html, BOX_MARKERS));
      const dec = surfaceOf(themeCss, tokens, classesOfAny(html, DEC_MARKERS));
      if (box.borderWidth) return `плашка/${box.radius}`;
      if (paints(dec.bg)) return "две-плашки";
      return "пустота";
    }),
  );
  // rose 8px + bloom 4px + satin 0px + flux пустота + vanilla две плашки
  expect(silhouettes.size).toBeGreaterThanOrEqual(3);
}, 300_000);

/**
 * КАЛИБРОВКА. Резолвер обязан давать ТЕ ЖЕ числа, что настоящий браузер.
 * Значения ниже сняты в Chromium 1440px 2026-09-14 на странице, собранной как
 * витрина: бандл `dist/theme-css/<тема>.css` в <head>, а `tokens.css` —
 * последним (`src/themes/tokens-inject.ts` вставляет его перед </head>).
 * Порядок важен: при обратном vanilla давала плашку rgb(58,69,48) из
 * `global.css:24`, а не цвет кнопки схемы.
 *
 * Если правка в токенах/бандле сдвинет числа — упадёт этот блок, и станет
 * видно, что разъехались замер и реальность, а не «тема сломалась».
 */
const CHROMIUM: Record<
  Theme,
  { border: string | null; radius: number; decBg: string | null }
> = {
  rose: { border: "rgb(153,153,153)", radius: 8, decBg: null },
  bloom: { border: "rgb(230,230,230)", radius: 4, decBg: null },
  satin: { border: "rgb(230,230,230)", radius: 0, decBg: null },
  flux: { border: null, radius: 0, decBg: null },
  vanilla: { border: null, radius: 0, decBg: "rgb(58,69,48)" },
};

describe.each(THEMES)("калибровка по Chromium — %s", (theme) => {
  it("резолвер даёт те же числа, что браузер", () => {
    if (!built(theme)) return;
    const tokens = tokenMap(buildTokensCss({}, theme), SCHEME);
    const themeCss = themeCssOf(theme);
    const html = renderProduct(theme, "seed");
    const box = surfaceOf(themeCss, tokens, classesOfAny(html, BOX_MARKERS));
    const dec = surfaceOf(themeCss, tokens, classesOfAny(html, DEC_MARKERS));
    const want = CHROMIUM[theme];
    expect({
      рамка: box.borderWidth ? box.borderColor : null,
      радиус: box.radius ?? 0,
      заливкаКнопки: paints(dec.bg) ? dec.bg : null,
    }).toEqual({
      рамка: want.border,
      радиус: want.radius,
      заливкаКнопки: want.decBg,
    });
  }, 180_000);
});

/**
 * Саботаж: проверки обязаны краснеть именно на той теме, чьё оформление
 * подменили чужим. Без этого раздела они могут быть зелёными по случайности —
 * например, если резолвер перестанет находить правило и начнёт возвращать null
 * на всё подряд.
 */
describe("саботаж — подмена оформления одной темы на чужое", () => {
  it("rose с «пустотой» flux перестаёт быть плашкой", () => {
    if (!built("rose")) return;
    const tokens = tokenMap(buildTokensCss({}, "rose"), SCHEME);
    const themeCss = themeCssOf("rose");
    const html = renderProduct("rose", "seed");
    const real = surfaceOf(themeCss, tokens, classesOfAny(html, BOX_MARKERS));
    expect(real.borderWidth).toBe(1);
    // Ровно прежняя (общая) разметка: inline-обёртка без рамки.
    const dead = surfaceOf(themeCss, tokens, [
      "inline-flex",
      "items-center",
      "gap-3",
    ]);
    expect(dead.borderWidth).toBeNull();
  }, 180_000);

  it("vanilla с плашкой rose теряет заливку кнопок", () => {
    if (!built("vanilla")) return;
    const tokens = tokenMap(buildTokensCss({}, "vanilla"), SCHEME);
    const themeCss = themeCssOf("vanilla");
    const html = renderProduct("vanilla", "seed");
    const real = surfaceOf(themeCss, tokens, classesOfAny(html, DEC_MARKERS));
    expect(paints(real.bg)).toBe(true);
    // Классы кнопки boxed-варианта (rose/bloom/satin) — заливки у них нет.
    const dead = surfaceOf(themeCss, tokens, [
      "inline-flex",
      "items-center",
      "justify-center",
      "bg-transparent",
    ]);
    expect(paints(dead.bg)).toBe(false);
  }, 180_000);

  it("резолвер не слеп: несуществующий класс даёт null, а рабочий — число", () => {
    const tokens = tokenMap(buildTokensCss({}, "rose"), SCHEME);
    const themeCss = themeCssOf("rose");
    expect(
      winningDecl(themeCss, ["нет-такого-класса"], "border-width"),
    ).toBeNull();
    expect(
      px(
        substituteTokens(
          winningDecl(themeCss, ["border"], "border-width") ?? "",
          tokens,
        ),
      ),
    ).toBe(1);
  });
});
