/**
 * Дефолт поля панели обязан быть НЕЗАМЕТЕН витрине.
 *
 * Зачем. `CustomFieldsPanel.updateProp` при ЛЮБОЙ правке мержит defaultProps в
 * props (`{...defaultProps, ...existingProps, [field]: value}`) — значит дефолт
 * не остаётся «подсказкой в сайдбаре», он МАТЕРИАЛИЗУЕТСЯ в данные секции.
 * Если он отличается от фолбэка порта, мерчант правит цвет — и уезжает размер.
 * Это ровно тот класс багов, из-за которого правка появилась (жалоба владельца
 * 2026-09-13: «настройки стоят в нейтральном положении, поэтому ловим баги»).
 *
 * Контракт. Для каждого поля ОФОРМЛЕНИЯ (select / radio / alignment / toggle /
 * slider), у которого есть дефолт, рендер секции с ПОЛНЫМ набором defaultProps
 * обязан совпадать байт-в-байт с рендером тех же props БЕЗ этого поля. Секция
 * рендерится ТЕМ ЖЕ скомпилированным модулем темы, что уходит на витрину и в
 * превью (dist/theme-sections/<тема>), а defaultProps берутся у того же
 * контроллера, который отдаёт конфиг конструктору.
 *
 * ОБА рендера идут ЖИВОЙ цепочкой (`live: true` у рендерера): adaptLegacyProps
 * → deepMergeBlockProps(theme.json blockDefaults) → resolveBlockProps. Это не
 * украшение: «нет значения в ревизии» НЕ равно «нет значения у порта». Между
 * ревизией и портом стоят два звена, которые сами доставляют значение, и оба
 * работают одинаково на витрине (v2-live-pages → renderBlock) и в точечном
 * hot-render конструктора (POST /preview/block):
 *   1. page-blocks (adaptLegacyProps) — например, `coercePopularProductsProps`
 *      жёстко ставит cards=4/columns=4, когда числа нет;
 *   2. theme.json `blockDefaults` — например, rose Header.logoPosition,
 *      bloom Hero.overlay/position, satin PopularProducts.
 * Сырой рендер модуля мимо этих звеньев показывает состояние, которого на
 * живом сайте не существует. Пока проверка меряла его, в KNOWN_DIVERGENT
 * копились «расхождения», которых у мерчанта нет, — а «починка» такой записи
 * (сдвинуть дефолт панели под сырой фолбэк порта) РЕАЛЬНО меняла бы витрину,
 * то есть ровно тот вред, ради которого проверку и писали.
 *
 * Почему снимки секций этого не ловят: они рендерят фиксированный набор пропсов
 * и вообще не знают про defaultProps — «дефолт разошёлся с портом» для них
 * выглядит нормой.
 *
 * «Вид верстальщиков при незаданной настройке». В секциях бывает ветка
 * «настройка не задана — рисуем вид верстальщиков». Панель показывала
 * «Квадрат», а витрина — портрет верстальщиков: первая же правка секции
 * вписывала «Квадрат», и вид прыгал (владелец 25.09: «что в панели — то и на
 * витрине»).
 *
 * ВСЕ КЛЮЧИ, не только поля. updateProp вписывает весь defaultProps — и
 * скрытые поля, и ключи вовсе без поля. Поэтому «полный набор» ниже — это
 * defaultProps целиком (puck-config-deep.mjs), а вторая проверка проходит по
 * КАЖДОМУ его ключу. Так ловится vanilla «Основной текст»: скрытые
 * headingSize/textSize='medium' вписывались первой правкой, и заголовок
 * прыгал 16 → 20 px. Часть ключей расходится законно (контент, колонки
 * подвала) — их набор закреплён в KNOWN_ANY_KEY; новый ключ в нём сам не
 * появляется: новое расхождение — красный.
 *
 * До 25.09 файл гонял каждую тему в двух режимах — с признаком «как у
 * верстальщиков» (`__designParity`) и без. У секций теперь одна версия,
 * признака нет, режим один.
 *
 * Требует сборки: pnpm build, pnpm build:blocks, pnpm build:theme-sections:all.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { resolveVariantDisplay } from "../../../packages/theme-base/runtime/variant-display";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const PANEL = resolve(__dirname, "puck-config-deep.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
type Theme = (typeof THEMES)[number];

/** Поля ОФОРМЛЕНИЯ. Контент (тексты, картинки, пикеры) сюда не входит: у него
 *  дефолта нет по определению, а `colorScheme` наследуется от :root. */
const STYLE_TYPES = new Set([
  "select",
  "radio",
  "alignment",
  "toggle",
  "slider",
]);

/**
 * Дефолты оформления, которые РАСХОДЯТСЯ с фолбэком порта на ЖИВОЙ цепочке.
 *
 * Новая запись здесь НЕ появляется сама: добавили дефолт — либо он совпал с
 * портом, либо тест красный. Именно это и сторожим.
 */
const KNOWN_DIVERGENT: Record<Theme, readonly string[]> = {
  rose: [],
  flux: [],
  vanilla: [],
  satin: [],
  bloom: [],
};

/**
 * Ключи defaultProps (любые, не только оформление), у которых рендер с
 * дефолтом и без ключа уже расходится. Снимок 25.09, когда у секций осталась
 * одна версия; до этого те же ключи расходились и без признака режима, и
 * сторож их не показывал. Здесь контент-заглушки, колонки подвала, отступы и
 * Ключ отсюда уходит, когда его чинят; новый сюда сам не попадает. Ушли:
 * rose/vanilla `Hero.contentPosition` (25.09 — панель больше не вписывает
 * скрытую позицию первого экрана), bloom `MainText.textSize` (25.09 — панель
 * больше не вписывает скрытый размер текста), bloom `Footer.newsletter` (25.09 —
 * «Рассылка» по умолчанию «Показать», как тема и рисует без настройки), flux
 * `Product.variants` (25.09 — «Вариации» по умолчанию «Нет», как рисует
 * страница товара).
 */
const KNOWN_ANY_KEY: Record<Theme, readonly string[]> = {
  rose: [
    "CartBody.colorScheme",
    "CartSection.padding",
    "CollapsibleSection.heading",
    "CollapsibleSection.sections",
    "Collections.collections",
    "Collections.heading",
    "ContactForm.description",
    "Footer.informationColumn",
    "Footer.navigationColumn",
    "Gallery.items",
    "Header.navigationLinks",
    "Hero.cta",
    "Hero.padding",
    "Hero.title",
    "ImageWithText.button",
    "MainText.heading",
    "MainText.text",
    "MultiColumns.columns",
    "MultiColumns.heading",
    "MultiRows.rows",
    "Newsletter.buttonText",
    "Newsletter.heading",
    "Newsletter.placeholder",
    "PopularProducts.heading",
    "PromoBanner.link",
    "PromoBanner.padding",
    "PromoBanner.text",
    "Slideshow.slides",
    "WishlistSection.padding",
  ],
  flux: [
    "CartBody.colorScheme",
    "CartBody.padding",
    "CartSection.padding",
    "CartSummary.padding",
    "CollapsibleSection.heading",
    "CollapsibleSection.sections",
    "Collections.collections",
    "Collections.heading",
    "ContactForm.description",
    "Gallery.items",
    "Header.navigationLinks",
    "Header.siteTitle",
    "Hero.cta",
    "Hero.padding",
    "Hero.title",
    "ImageWithText.button",
    "ImageWithText.heading",
    "ImageWithText.text",
    "MainText.heading",
    "MainText.text",
    "MultiColumns.columns",
    "MultiColumns.heading",
    "MultiRows.rows",
    "Newsletter.buttonText",
    "Newsletter.heading",
    "Newsletter.placeholder",
    "PopularProducts.heading",
    "PopularProducts.quickAddText",
    "PromoBanner.colorScheme",
    "PromoBanner.link",
    "PromoBanner.padding",
    "PromoBanner.text",
    "Slideshow.slides",
    "WishlistSection.padding",
  ],
  vanilla: [
    "CartBody.colorScheme",
    "CartBody.padding",
    "CartSection.padding",
    "CartSummary.padding",
    "CollapsibleSection.heading",
    "CollapsibleSection.sections",
    "Collections.collections",
    "Collections.heading",
    "Collections.imageView",
    "ContactForm.description",
    "Footer.informationColumn",
    "Footer.navigationColumn",
    "Gallery.items",
    "Header.navigationLinks",
    "Header.siteTitle",
    "Hero.cta",
    "Hero.padding",
    "Hero.title",
    "ImageWithText.text",
    "MainText.heading",
    "MainText.text",
    "MultiColumns.columns",
    "MultiColumns.heading",
    "MultiRows.rows",
    "Newsletter.buttonText",
    "Newsletter.heading",
    "Newsletter.placeholder",
    "PopularProducts.heading",
    "PromoBanner.link",
    "PromoBanner.padding",
    "PromoBanner.text",
    "Slideshow.slides",
    "WishlistSection.padding",
  ],
  satin: [
    "CartBody.colorScheme",
    "CartBody.padding",
    "CartSection.padding",
    "CartSummary.padding",
    "CollapsibleSection.sections",
    "Collections.padding",
    "ContactForm.description",
    "Footer.informationColumn",
    "Footer.navigationColumn",
    "Footer.socialColumn",
    "Gallery.items",
    "Header.navigationLinks",
    "Header.padding",
    "Header.siteTitle",
    "Hero.cta",
    "Hero.padding",
    "ImageWithText.button",
    "ImageWithText.text",
    "MainText.heading",
    "MainText.text",
    "MultiColumns.columns",
    "MultiRows.padding",
    "MultiRows.rows",
    "Newsletter.buttonText",
    "Newsletter.placeholder",
    "PopularProducts.heading",
    "PromoBanner.link",
    "PromoBanner.padding",
    "PromoBanner.text",
    "Slideshow.slides",
    "WishlistSection.padding",
  ],
  bloom: [
    "CartBody.padding",
    "CartSection.padding",
    "CartSummary.padding",
    "CollapsibleSection.sections",
    "Collections.imageView",
    "ContactForm.description",
    "ContactForm.heading",
    "Footer.informationColumn",
    "Footer.navigationColumn",
    "Gallery.items",
    "Header.navigationLinks",
    "Hero.cta",
    "Hero.padding",
    "ImageWithText.button",
    "MainText.heading",
    "MainText.text",
    "MultiColumns.columns",
    "MultiRows.rows",
    "Newsletter.buttonText",
    "Newsletter.placeholder",
    "PopularProducts.heading",
    "PopularProducts.quickAddText",
    "PromoBanner.link",
    "PromoBanner.padding",
    "PromoBanner.text",
    "Slideshow.slides",
    "WishlistSection.padding",
  ],
};

type Deep = Record<
  string,
  { defaults: Record<string, unknown>; types: Record<string, string | null> }
>;
type Job = { block: string; props: Record<string, unknown>; live: true };
type Row = {
  block: string;
  html?: string;
  missing?: boolean;
  error?: string;
  pipelineError?: string;
};

const digest = (s: string | undefined): string =>
  createHash("sha1")
    .update(s ?? "")
    .digest("hex");

const hasValue = (v: unknown): boolean =>
  v !== undefined && v !== null && v !== "";

function themeBlocks(theme: Theme): string[] | null {
  const mf = resolve(
    SITES_ROOT,
    "dist",
    "theme-sections",
    theme,
    "manifest.json",
  );
  if (!existsSync(mf)) return null;
  return Object.keys(
    JSON.parse(readFileSync(mf, "utf-8")) as Record<string, string>,
  );
}

function readPanel(theme: Theme): Deep | null {
  try {
    const raw = execFileSync("node", [PANEL, theme], {
      cwd: SITES_ROOT,
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(raw) as Deep;
  } catch {
    return null;
  }
}

/**
 * Задания — ФАЙЛОМ («@путь»), не строкой аргумента: пары рендеров дают сотни
 * КиБ на тему, а Linux режет один аргумент на 128 КиБ (MAX_ARG_STRLEN) — на
 * раннере проверка упала бы там, где на macOS зелёная.
 */
function render(theme: Theme, jobs: Job[]): Row[] {
  const file = join(mkdtempSync(join(tmpdir(), "panel-noop-")), "jobs.json");
  writeFileSync(file, JSON.stringify(jobs));
  const raw = execFileSync("node", [RENDERER, theme, `@${file}`], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 512 * 1024 * 1024,
  });
  return JSON.parse(raw) as Row[];
}

/** Ключ defaultProps с непустым значением; `style` — поле оформления. */
type Pair = {
  block: string;
  key: string;
  style: boolean;
  full: Record<string, unknown>;
};

/** Все ключи defaultProps каждого блока темы (updateProp впишет их все). */
function defaultPairs(panel: Deep, blocks: string[]): Pair[] {
  return Object.entries(panel)
    .filter(([block]) => blocks.includes(block)) // блока нет у темы — мимо
    .flatMap(([block, { defaults, types }]) => {
      const full: Record<string, unknown> = { id: `${block}-1`, ...defaults };
      return Object.entries(defaults)
        .filter(([, value]) => hasValue(value))
        .map(([key]) => ({
          block,
          key,
          style: STYLE_TYPES.has(types[key] ?? ""),
          full,
        }));
    });
}

/** Сравнение пары «с дефолтом / без ключа»: null — совпали или сравнивать нечего. */
function divergence(withDef?: Row, without?: Row): string | null {
  if (withDef?.missing || without?.missing) return null;
  if (withDef?.error || without?.error) return null;
  // Живая цепочка не поднялась (нет dist/src) — молчать нельзя.
  const pipe = withDef?.pipelineError ?? without?.pipelineError;
  if (pipe) return `живая цепочка не поднялась: ${pipe}`;
  return digest(withDef?.html) === digest(without?.html) ? null : "разошлись";
}

describe.each(THEMES)("дефолт не меняет вид витрины — %s", (theme) => {
  const blocks = themeBlocks(theme);
  const panel = readPanel(theme);
  const built = blocks !== null && panel !== null;
  const pairs = built ? defaultPairs(panel, blocks) : [];

  /** Задания: пара рендеров (с дефолтом / без ключа) на каждый ключ. */
  const pairJobs: Job[] = pairs.flatMap(({ key, block, full }) => {
    const without: Record<string, unknown> = { ...full };
    delete without[key];
    return [
      { block, props: { ...full }, live: true as const },
      { block, props: without, live: true as const },
    ];
  });

  let rows: Row[] = [];
  beforeAll(() => {
    if (!built || pairs.length === 0) return;
    rows = render(theme, pairJobs);
  }, 600_000);

  /** Расхождение ключа `i`. */
  const verdict = (i: number): string | null => divergence(rows[i * 2], rows[i * 2 + 1]);

  /** Ключи, у которых рендер с дефолтом и без него расходится. */
  const divergentKeys = (only: (p: Pair) => boolean): string[] =>
    pairs
      .map((p, i) => ({ p, why: verdict(i) }))
      .filter(({ p, why }) => only(p) && why !== null)
      .map(({ p, why }) =>
        why === "разошлись" ? `${p.block}.${p.key}` : `${p.block}.${p.key} (${why})`,
      )
      .sort();

  it("секции темы собраны и puck-config прочитан", () => {
    expect(built).toBe(true);
    expect(pairs.filter((p) => p.style).length).toBeGreaterThan(0);
  });

  it("каждый дефолт оформления — no-op для порта", () => {
    if (!built) return;
    // Дефолт разошёлся с портом: рендер со значением и без него отличается.
    // Правьте ДЕФОЛТ (он обязан повторять фолбэк порта) или ветку порта
    // «не задано», а не снимок.
    expect(divergentKeys((p) => p.style)).toEqual([...KNOWN_DIVERGENT[theme]].sort());
  });

  it("«Товар»: «Стиль» и «Вариации» по умолчанию = вид страницы товара без настройки", () => {
    if (!built) return;
    // Секции «Товар» у rose/vanilla/bloom/satin нет в наборе модулей темы (её
    // рисует общий блок), поэтому парный рендер выше её не видит. Правило то же:
    // значение панели по умолчанию обязано рисовать то, что рисует отсутствие
    // значения, — иначе первая правка секции меняет вид вариантов.
    expect(resolveVariantDisplay(panel?.Product?.defaults?.variants)).toEqual(
      resolveVariantDisplay(undefined),
    );
  });

  it("панель не вписывает скрытую легаси-позицию первого экрана (contentPosition)", () => {
    if (!built) return;
    // Владелец 25.09: у rose и vanilla первая же правка секции вписывала
    // contentPosition:'center', и текст первого экрана уезжал с места темы в
    // центр. Порты читают position ?? contentPosition — значение по умолчанию
    // у скрытого поля не имеет права быть.
    expect(panel?.Hero?.defaults).not.toHaveProperty("contentPosition");
  });

  it("ни один ключ defaultProps не добавляет нового расхождения", () => {
    if (!built) return;
    // Любой ключ вне KNOWN_ANY_KEY обязан вписываться незаметно. Иначе в
    // секции живёт ветка «не задано — рисуем вид верстальщиков», и первая
    // правка секции (даже цвета) меняет ей вид: панель вписывает свой
    // дефолт, в том числе скрытый.
    expect(divergentKeys(() => true)).toEqual([...KNOWN_ANY_KEY[theme]].sort());
  });
});
