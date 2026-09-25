/**
 * Порядок размеров: «Тонкий ≤ Маленький ≤ Средний ≤ Большой» на КАЖДОЙ ширине.
 *
 * Зачем. Владелец 25.09: «что в панели — то и на витрине». Под признаком
 * «как у верстальщиков» (`__designParity`, на проде у всех сайтов) значение
 * по умолчанию может взять кегли верстальщиков, ТОЛЬКО если порядок
 * вариантов сохраняется на каждой ширине, а явно выбранный вариант всегда
 * рисует себя. До правки bloom «Изображение» нарушал оба правила сразу: явно
 * выбранный «Большой» заголовок попадал в ветку «не задано» и на телефоне
 * выходил 14 px — меньше «Среднего» (15), а «Большой» текст равнялся
 * «Среднему». Байт-сравнение дефолта (panel-default-is-noop) такого не видит:
 * там сравнивается дефолт с «не задано», а не варианты между собой.
 *
 * Как. СПЛОШНОЙ обход пяти тем: каждое поле-размер каждой секции на любой
 * глубине (верхнее поле, «Заголовок → Размер заголовка», «Ряды → Размер») —
 * список берётся из панели темы (puck-config-deep.mjs), не из списка файлов.
 * Каждый вариант рендерится ЖИВОЙ цепочкой витрины (renderSections: та же
 * лестница модулей, adaptLegacyProps → blockDefaults → resolveBlockProps) в
 * двух режимах — без признака и с ним, — и кладётся на страницу с CSS темы и
 * tokens.css. Кегль меряет настоящий браузер: у тем он собирается из
 * медиазапросов, слоёв, `clamp()` от ширины окна и переменных на предках —
 * разбор CSS без браузера на этом врёт. На каждой ширине для каждого
 * ВИДИМОГО узла с собственным текстом, который есть у обоих вариантов, кегль
 * меньшего варианта не больше кегля большего.
 *
 * Меряется кегль, а не высота блоков: «Размер» у одних полей — шрифт, у
 * других — высота или ширина, и крупный текст законно сужает соседнюю
 * колонку. Кегль у любого поля-размера обязан расти монотонно.
 *
 * Вторая проверка — «явный вариант рисует себя». Порядок «≤» пропускает
 * равенство, а bloom «Большой» текст под признаком был РАВЕН «Среднему»:
 * явное значение падало в ветку «не задано». Поэтому: узлы, которые поле
 * двигает (их кегль различается между вариантами), у явно выбранного
 * варианта, который НЕ является значением панели по умолчанию, рисуются
 * одинаково с признаком и без. Значение по умолчанию под признаком менять
 * кегль может — правило 25.09 разрешает ему взять числа верстальщиков, если
 * порядок сохраняется; остальные варианты признак не трогает.
 *
 * Браузер: встроенный Chromium Playwright, если он установлен; иначе Google
 * Chrome системы (`channel: "chrome"`, на раннерах ubuntu-latest он стоит).
 * Нет ни того, ни другого — сторож падает громко, а не молчит.
 *
 * Требует сборки: pnpm build, pnpm build:blocks, pnpm build:theme-sections:all.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { chromium, type Browser, type Page } from "playwright";

import {
  renderSections,
  themeCss,
  tokensCssFor,
} from "../../../scripts/qa/lib";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const PANEL = resolve(__dirname, "puck-config-deep.mjs");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
type Theme = (typeof THEMES)[number];

/** Ширины окна: края брейкпоинтов Tailwind (640/768/1024/1280/1536), 720 тем и промежутки для `clamp()`. */
const WIDTHS = [
  320, 360, 375, 390, 414, 480, 560, 639, 640, 700, 719, 720, 767, 768, 800,
  900, 1000, 1023, 1024, 1100, 1200, 1279, 1280, 1366, 1440, 1535, 1536, 1680,
  1920,
] as const;

const MODES = [
  { name: "без признака", extra: {} },
  { name: "с признаком", extra: { __designParity: true } },
] as const;

/**
 * Нарушения порядка, которые были ДО 25.09 и к признаку отношения не имеют
 * (есть в обоих режимах). Найдены этим обходом; решение за владельцем —
 * какие числа правильные. Новая запись сама не появляется: любое новое
 * нарушение — красный.
 *   (пусто: оба прежних нарушения — rose «Галерея» заголовок и flux «Панель
 *   объявлений» — исправлены 25.09 по решению владельца «настройки значат то,
 *   что написано»).
 */
const KNOWN_ORDER: Record<Theme, readonly string[]> = {
  rose: [],
  bloom: [],
  satin: [],
  flux: [],
  vanilla: [],
};

type Scale = {
  path: string[];
  label: string;
  options: string[];
  def: string | null;
};
type Deep = Record<
  string,
  { sample: Record<string, unknown>; scales: Scale[] }
>;
/**
 * Вариант поля-размера в одном из режимов; `def` — значение панели по
 * умолчанию, `placed` — во сколько мест значение легло в пропсы.
 */
type Case = {
  block: string;
  scale: string;
  mode: string;
  value: string;
  def: string | null;
  placed: number;
  props: Record<string, unknown>;
};
/** Кегли видимых узлов с текстом: ширина → ключ узла → px. */
type Sizes = Record<number, Record<string, number>>;
/** Клетка сравнения двух случаев: ширина × узел, который есть у обоих. */
type Cell = { width: number; key: string; first: number; second: number };

function readPanel(theme: Theme): Deep {
  const raw = execFileSync("node", [PANEL, theme], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(raw) as Deep;
}

/**
 * Поставить значение по пути; «*» — каждый элемент списка. Объектов по пути
 * не создаёт. Возвращает, во сколько мест значение легло: ноль — поле
 * проверялось бы впустую (список без элементов по умолчанию).
 */
function setAt(obj: unknown, path: string[], value: string): number {
  if (!obj || typeof obj !== "object") return 0;
  const [head, ...rest] = path;
  if (head === "*") {
    if (!Array.isArray(obj)) return 0;
    return obj.reduce(
      (n: number, item: unknown) => n + setAt(item, rest, value),
      0,
    );
  }
  const target = obj as Record<string, unknown>;
  if (rest.length > 0) return setAt(target[head], rest, value);
  target[head] = value;
  return 1;
}

/** Все варианты поля-размера в обоих режимах. */
function variantsOf(
  block: string,
  sample: Record<string, unknown>,
  s: Scale,
): Case[] {
  const scale = `${block}.${s.path.filter((x) => x !== "*").join(".")}`;
  return MODES.flatMap(({ name, extra }) =>
    s.options.map((value) => {
      const props = structuredClone({
        id: `${block}-1`,
        ...sample,
        ...extra,
      }) as Record<string, unknown>;
      const placed = setAt(props, s.path, value);
      return { block, scale, mode: name, value, def: s.def, placed, props };
    }),
  );
}

function casesOf(panel: Deep): { cases: Case[]; vacant: string[] } {
  const all = Object.entries(panel).flatMap(([block, { sample, scales }]) =>
    scales.flatMap((s) => variantsOf(block, sample, s)),
  );
  const vacant = all
    .filter((c) => c.placed === 0)
    .map((c) => `${c.scale} [${c.mode}]`);
  return {
    cases: all.filter((c) => c.placed > 0),
    vacant: [...new Set(vacant)],
  };
}

// Запоминаем ОБЕЩАНИЕ запуска, а не браузер: замеры идут параллельно
// (Promise.all по ширинам), и пока первый запуск не закончился, второй вызов
// видел null и запускал свой браузер. Закрывался только последний — лишний
// держал jest живым после прогона: одиночный запуск файла висел до потолка в
// 10 минут (25.09, spec 115).
let shared: Promise<Browser> | null = null;
function browser(): Promise<Browser> {
  shared ??= launchBrowser();
  return shared;
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (bundled) {
    try {
      return await chromium.launch({ channel: "chrome" });
    } catch (system) {
      throw new Error(
        `нет браузера для замера: встроенный Chromium — ${String(bundled).slice(0, 200)}; Chrome системы — ${String(system).slice(0, 200)}`,
      );
    }
  }
}

afterAll(async () => {
  const b = await shared;
  shared = null;
  await b?.close();
});

/** Скрипты секций вон: замер кегля от них не зависит, а гидрация тянула бы сеть. */
const stripScripts = (html: string): string =>
  html.replace(/<script\b[\s\S]*?<\/script>/gi, "");

/**
 * Исполняется В БРАУЗЕРЕ: кегль каждого видимого узла с собственным текстом,
 * по случаям страницы. Ключ узла — тег, начало текста и номер повтора.
 */
function probeFontSizes(): Record<string, Record<string, number>> {
  const ownText = (el: Element): string =>
    Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  const shown = (el: Element): boolean =>
    ownText(el) !== "" &&
    el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility !== "hidden";
  const keyed = (els: Element[]): Record<string, number> => {
    const seen: Record<string, number> = {};
    return Object.fromEntries(
      els.map((el) => {
        const key = `${el.tagName.toLowerCase()}|${ownText(el).slice(0, 32)}`;
        seen[key] = (seen[key] ?? 0) + 1;
        return [
          `${key}|${seen[key]}`,
          parseFloat(getComputedStyle(el).fontSize),
        ];
      }),
    );
  };
  return Object.fromEntries(
    Array.from(document.querySelectorAll<HTMLElement>("[data-case]")).map(
      (box) => [
        box.dataset.case ?? "",
        keyed(Array.from(box.querySelectorAll("*")).filter(shown)),
      ],
    ),
  );
}

/** Варианты одного блока — на одной странице; окно проходит по всем ширинам. */
async function measureBlock(
  page: Page,
  head: string,
  htmls: { index: number; html: string }[],
  sizes: Sizes[],
): Promise<void> {
  const body = htmls
    .map(
      ({ index, html }) =>
        `<div data-case="${index}">${stripScripts(html)}</div>`,
    )
    .join("\n");
  await page.setContent(
    `<!doctype html><html lang="ru"><head>${head}</head><body>${body}</body></html>`,
    { waitUntil: "domcontentloaded" },
  );
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const got = await page.evaluate(probeFontSizes);
    Object.entries(got).forEach(([i, map]) => {
      sizes[Number(i)][width] = map;
    });
  }
}

/** Группы индексов случаев по ключу. */
function groupBy(cases: Case[], keyOf: (c: Case) => string): number[][] {
  const groups = new Map<string, number[]>();
  cases.forEach((c, i) =>
    groups.set(keyOf(c), [...(groups.get(keyOf(c)) ?? []), i]),
  );
  return [...groups.values()];
}

/** Кегли всех вариантов темы и ошибки рендера. */
async function measure(
  theme: Theme,
  cases: Case[],
): Promise<{ sizes: Sizes[]; errors: string[] }> {
  const rows = renderSections(
    theme,
    cases.map((c) => ({ block: c.block, props: c.props })),
  );
  const errors = rows
    .map((r, i) => ({ r, c: cases[i] }))
    .filter(({ r }) => !r.html)
    .map(
      ({ r, c }) =>
        `${c.scale}=${c.value} [${c.mode}]: ${r.error ?? (r.missing ? "нет модуля" : "нет html")}`,
    );
  const head = `<meta charset="utf-8"><style>${themeCss(theme)}</style><style id="__merfy_tokens_css">${tokensCssFor(theme)}</style>`;
  const ctx = await (
    await browser()
  ).newContext({ viewport: { width: WIDTHS[0], height: 900 } });
  const page = await ctx.newPage();
  // Внешняя сеть заглушена: кегль не зависит от картинок и шрифтов.
  await page.route("**/*", (route) =>
    /^(data:|about:)/.test(route.request().url())
      ? route.continue()
      : route.abort(),
  );
  const sizes: Sizes[] = cases.map(() => ({}));
  const blocks = groupBy(cases, (c) => c.block).map((ids) =>
    ids.map((index) => ({ index, html: rows[index]?.html ?? "" })),
  );
  try {
    for (const htmls of blocks) await measureBlock(page, head, htmls, sizes);
  } finally {
    await ctx.close();
  }
  return { sizes, errors };
}

/** Клетки сравнения двух случаев: каждая ширина × каждый общий узел. */
const cellsOf = (sizes: Sizes[], a: number, b: number): Cell[] =>
  WIDTHS.flatMap((width) =>
    Object.entries(sizes[a][width] ?? {})
      .filter(([key]) => sizes[b][width]?.[key] !== undefined)
      .map(([key, first]) => ({
        width,
        key,
        first,
        second: sizes[b][width][key],
      })),
  );

/** Пары «меньший вариант, больший вариант»: индексы идут в порядке шкалы. */
const pairsOf = (ids: number[]): [number, number][] =>
  ids.flatMap((a, n) => ids.slice(n + 1).map((b): [number, number] => [a, b]));

type Verdict = {
  violations: string[];
  details: string[];
  unmeasured: string[];
  cells: number;
  scales: number;
};

/** Порядок вариантов каждого поля в каждом режиме: меньший вариант ≤ большего. */
function judge(cases: Case[], sizes: Sizes[]): Verdict {
  const groups = groupBy(cases, (c) => `${c.scale}\u0000${c.mode}`).map(
    (ids) => ({
      label: `${cases[ids[0]].scale} [${cases[ids[0]].mode}]`,
      pairs: pairsOf(ids).map(([a, b]) => ({
        tag: `${cases[a].scale}: ${cases[a].value}>${cases[b].value} [${cases[a].mode}]`,
        cells: cellsOf(sizes, a, b),
      })),
    }),
  );
  const pairs = groups.flatMap((g) => g.pairs);
  const broken = pairs
    .map(({ tag, cells }) => ({
      tag,
      cell: cells.find((c) => c.first > c.second + 0.01),
    }))
    .filter((p): p is { tag: string; cell: Cell } => p.cell !== undefined);
  return {
    violations: broken.map((p) => p.tag).sort(),
    details: broken.map(
      ({ tag, cell }) =>
        `${tag} — ${cell.width}px ${cell.key}: ${cell.first} > ${cell.second}`,
    ),
    unmeasured: groups
      .filter((g) => g.pairs.every((p) => p.cells.length === 0))
      .map((g) => g.label),
    cells: pairs.reduce((n, p) => n + p.cells.length, 0),
    scales: groups.length / MODES.length,
  };
}

/** Индекс случая по (поле, режим, вариант). */
const caseKey = (scale: string, mode: string, value: string): string =>
  `${scale}\u0000${mode}\u0000${value}`;

/**
 * Узлы, которые поле двигает: на какой-то ширине кегль узла различается
 * между вариантами (узел есть у всех). Остальные узлы (цена карточки,
 * соседний заголовок) полю не принадлежат, и признак законно меняет их сам.
 */
const movedKeys = (sizes: Sizes[], ids: number[]): string[] =>
  WIDTHS.flatMap((width) =>
    Object.keys(sizes[ids[0]]?.[width] ?? {}).filter((key) => {
      const px: (number | undefined)[] = ids.map((i) => sizes[i][width]?.[key]);
      return !px.includes(undefined) && new Set(px).size > 1;
    }),
  );

/**
 * Нарушения «явный вариант рисует себя» у одного поля: вне значения по
 * умолчанию признак не меняет кегль узлов, которые двигает поле.
 */
function ownVariantBreaks(
  scale: string,
  def: string | null,
  cases: Case[],
  sizes: Sizes[],
  at: Map<string, number>,
): string[] {
  const values = [
    ...new Set(cases.filter((c) => c.scale === scale).map((c) => c.value)),
  ];
  const idsOf = (mode: string): number[] =>
    values
      .map((v) => at.get(caseKey(scale, mode, v)))
      .filter((i): i is number => i !== undefined);
  const moved = new Set(
    MODES.flatMap(({ name }) => movedKeys(sizes, idsOf(name))),
  );
  return values
    .filter((value) => value !== def)
    .map((value) => ({
      value,
      off: at.get(caseKey(scale, MODES[0].name, value)),
      on: at.get(caseKey(scale, MODES[1].name, value)),
    }))
    .filter(
      (v): v is { value: string; off: number; on: number } =>
        v.off !== undefined && v.on !== undefined,
    )
    .map(({ value, off, on }) => ({
      value,
      cell: cellsOf(sizes, off, on).find(
        (c) => moved.has(c.key) && Math.abs(c.first - c.second) > 0.01,
      ),
    }))
    .filter((v): v is { value: string; cell: Cell } => v.cell !== undefined)
    .map(
      ({ value, cell }) =>
        `${scale}: «${value}» — ${cell.width}px ${cell.key}: без признака ${cell.first}, с признаком ${cell.second}`,
    );
}

/** Явный вариант рисует себя — по всем полям темы. */
function judgeOwnVariant(cases: Case[], sizes: Sizes[]): string[] {
  const at = new Map(
    cases.map((c, i) => [caseKey(c.scale, c.mode, c.value), i]),
  );
  const scales = [...new Map(cases.map((c) => [c.scale, c.def])).entries()];
  return scales
    .flatMap(([scale, def]) => ownVariantBreaks(scale, def, cases, sizes, at))
    .sort();
}

jest.setTimeout(600_000);

describe.each(THEMES)("порядок размеров — %s", (theme) => {
  let verdict: Verdict | null = null;
  let ownVariant: string[] = [];
  let errors: string[] = [];
  let vacant: string[] = [];

  beforeAll(async () => {
    const { cases, vacant: empty } = casesOf(readPanel(theme));
    vacant = empty;
    const measured = await measure(theme, cases);
    errors = measured.errors;
    verdict = judge(cases, measured.sizes);
    ownVariant = judgeOwnVariant(cases, measured.sizes);
  }, 600_000);

  it("каждое поле-размер отрисовано и измерено в обоих режимах", () => {
    expect(errors).toEqual([]);
    expect(vacant).toEqual([]);
    expect(verdict?.scales ?? 0).toBeGreaterThan(20);
    // Поле без единого общего узла с текстом проверяло бы пустоту.
    expect(verdict?.unmeasured).toEqual([]);
    expect(verdict?.cells ?? 0).toBeGreaterThan(1000);
  });

  it("меньший вариант не крупнее большего ни на одной ширине", () => {
    // Подробности первого случая каждого нарушения — в сообщении сравнения.
    const got = verdict?.violations ?? [];
    const known = new Set(KNOWN_ORDER[theme]);
    const fresh = (verdict?.details ?? []).filter(
      (d) => !known.has(d.split(" — ")[0]),
    );
    expect({ violations: got, fresh }).toEqual({
      violations: [...KNOWN_ORDER[theme]].sort(),
      fresh: [],
    });
  });

  it("явно выбранный вариант рисует себя: признак не трогает его кегль", () => {
    // Значение по умолчанию сюда не входит: под признаком оно может взять
    // числа верстальщиков, если порядок сохраняется. Любой другой явный
    // вариант с признаком и без — один и тот же кегль у узлов, которые
    // двигает поле. Иначе явное значение падает в ветку «не задано».
    expect(ownVariant).toEqual([]);
  });
});
