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
 * ДВА РЕЖИМА: без признака и с `__designParity: true`. На проде признак
 * «как у верстальщиков» стоит у ВСЕХ сайтов (выключатель PARITY_DESIGN), и под
 * ним в секциях бывает ветка «настройка не задана — рисуем вид верстальщиков».
 * Прогон только без признака оставался зелёным, пока панель показывала
 * «Квадрат», а витрина — портрет верстальщиков: первая же правка секции
 * вписывала «Квадрат», и вид прыгал (владелец 25.09: «что в панели — то и на
 * витрине»). Признак кладётся в пропсы ревизии — живая цепочка его не
 * вычищает, как и page-blocks `prepareBlockProps` на витрине; отдельная
 * проверка ниже следит, что он действительно доходит до секций.
 *
 * ВСЕ КЛЮЧИ, не только поля. updateProp вписывает весь defaultProps — и
 * скрытые поля, и ключи вовсе без поля. Поэтому «полный набор» ниже — это
 * defaultProps целиком (puck-config-deep.mjs), а вторая проверка проходит по
 * КАЖДОМУ его ключу: признак не имеет права добавить расхождение, которого нет
 * без признака. Так ловится vanilla «Основной текст»: скрытые
 * headingSize/textSize='medium' вписывались первой правкой, и под признаком
 * заголовок прыгал 16 → 20 px. Расхождения, которые есть и БЕЗ признака, —
 * старая отдельная история (контент, колонки подвала), их сторожит не этот
 * файл; здесь сторожится ровно класс «вид верстальщиков при незаданной
 * настройке».
 *
 * Требует сборки: pnpm build, pnpm build:blocks, pnpm build:theme-sections:all.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { themeReadsDesignParity } from "./design-parity-forks";

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
 * Режимы рендера. `extra` кладётся в пропсы ОБОИХ рендеров пары (с дефолтом и
 * без него) — сравниваем только поле, режим у пары общий.
 */
const MODES = [
  { name: "без признака", extra: { __designParity: false } },
  { name: "с признаком __designParity", extra: { __designParity: true } },
] as const;
type Mode = (typeof MODES)[number]["name"];

/**
 * Дефолты оформления, которые РАСХОДЯТСЯ с фолбэком порта на ЖИВОЙ цепочке.
 *
 * Новая запись здесь НЕ появляется сама: добавили дефолт — либо он совпал с
 * портом, либо тест красный. Именно это и сторожим. Список общий для обоих
 * режимов: на проде признак у всех, без признака — прежние сайты и превью.
 */
const KNOWN_DIVERGENT: Record<Theme, readonly string[]> = {
  rose: [],
  flux: [],
  vanilla: [],
  satin: [],
  bloom: [],
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
 * Задания — ФАЙЛОМ («@путь»), не строкой аргумента: два режима дают сотни
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
  const fullBlocks = built
    ? Object.keys(panel).filter((b) => blocks.includes(b))
    : [];

  /** Задания: на каждый режим — пара рендеров (с дефолтом / без ключа) на
   *  каждый ключ, затем по одному полному рендеру на блок (проверка признака). */
  const pairJobs: Job[] = MODES.flatMap(({ extra }) =>
    pairs.flatMap(({ key, block, full }) => {
      const without: Record<string, unknown> = { ...full, ...extra };
      delete without[key];
      return [
        { block, props: { ...full, ...extra }, live: true as const },
        { block, props: without, live: true as const },
      ];
    }),
  );
  const fullJobs: Job[] = MODES.flatMap(({ extra }) =>
    fullBlocks.map((block) => ({
      block,
      props: { id: `${block}-1`, ...panel![block].defaults, ...extra },
      live: true as const,
    })),
  );

  let rows: Row[] = [];
  beforeAll(() => {
    if (!built || pairs.length === 0) return;
    rows = render(theme, [...pairJobs, ...fullJobs]);
  }, 600_000);

  /** Расхождение ключа `i` в режиме `m` (индексы MODES). */
  const verdict = (m: number, i: number): string | null => {
    const at = (m * pairs.length + i) * 2;
    return divergence(rows[at], rows[at + 1]);
  };

  it("секции темы собраны и puck-config прочитан", () => {
    expect(built).toBe(true);
    expect(pairs.filter((p) => p.style).length).toBeGreaterThan(0);
  });

  it("признак __designParity: тема с развилкой — меняет секции, тема одной версии — ничего", () => {
    if (!built) return;
    // Пока у темы есть развилка «как у верстальщиков / прежний вид», режим «с
    // признаком» обязан отличаться от режима «без» — иначе он мог бы молча
    // выродиться в копию (звено живой цепочки начнёт вычищать служебные
    // ключи), и сторож был бы зелёным, ничего не проверяя. Когда тема
    // переведена на одну версию секций (владелец 25.09), признак не должен
    // менять НИЧЕГО — это и проверяем.
    const base = pairJobs.length;
    const n = fullBlocks.length;
    const changed = fullBlocks.filter(
      (_, i) =>
        rows[base + i]?.html !== undefined &&
        rows[base + i]?.html !== rows[base + n + i]?.html,
    );
    if (themeReadsDesignParity(theme)) expect(changed.length).toBeGreaterThan(0);
    else expect(changed.length).toBe(0);
  });

  it.each(MODES.map((m, i) => [m.name, i] as [Mode, number]))(
    "каждый дефолт оформления — no-op для порта (%s)",
    (_mode, m) => {
      if (!built) return;
      const divergent = pairs
        .map((p, i) => ({ p, why: verdict(m, i) }))
        .filter(({ p, why }) => p.style && why !== null)
        .map(({ p, why }) =>
          why === "разошлись"
            ? `${p.block}.${p.key}`
            : `${p.block}.${p.key} (${why})`,
        );
      // Дефолт разошёлся с портом: рендер со значением и без него отличается.
      // Правьте ДЕФОЛТ (он обязан повторять фолбэк порта) или ветку порта
      // «не задано», а не снимок.
      expect(divergent.sort()).toEqual([...KNOWN_DIVERGENT[theme]].sort());
    },
  );

  it("признак не добавляет расхождений ни одному ключу defaultProps", () => {
    if (!built) return;
    // Любой ключ, который БЕЗ признака впишется незаметно, обязан вписываться
    // незаметно и С признаком. Иначе под признаком живёт ветка «не задано —
    // рисуем вид верстальщиков», и первая правка секции (даже цвета) меняет
    // ей вид: панель вписывает свой дефолт, в том числе скрытый.
    const added = pairs
      .map((p, i) => ({ p, off: verdict(0, i), on: verdict(1, i) }))
      .filter(({ off, on }) => off === null && on !== null)
      .map(({ p }) => `${p.block}.${p.key}`);
    expect(added.sort()).toEqual([]);
  });
});
