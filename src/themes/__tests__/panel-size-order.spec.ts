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

import { chromium, type Browser } from "playwright";

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
 *   • rose «Галерея», «Размер заголовка»: «Средний» — 20 px на любой ширине
 *     (задуманный в <style> clamp 14→20 проигрывает слоёной утилите
 *     дизайн-системы), «Большой» — clamp(17px, 4.6vw, 24px): на 320–414
 *     «Большой» 17–19 px меньше «Среднего».
 *   • flux «Панель объявлений», «Размер»: на ширине до 768 «Большой» 12 px
 *     меньше «Среднего» 14 px.
 */
const KNOWN_ORDER: Record<Theme, readonly string[]> = {
  rose: [
    "Gallery.headingSize: medium>large [без признака]",
    "Gallery.headingSize: medium>large [с признаком]",
  ],
  bloom: [],
  satin: [],
  flux: [
    "PromoBanner.size: medium>large [без признака]",
    "PromoBanner.size: medium>large [с признаком]",
  ],
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
/** Вариант поля-размера в одном из режимов; `def` — значение панели по умолчанию. */
type Case = {
  block: string;
  scale: string;
  mode: string;
  value: string;
  def: string | null;
  props: Record<string, unknown>;
};
/** Кегли видимых узлов с текстом: ширина → ключ узла → px. */
type Sizes = Record<number, Record<string, number>>;

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

function casesOf(panel: Deep): { cases: Case[]; vacant: string[] } {
  const cases: Case[] = [];
  const vacant: string[] = [];
  for (const [block, { sample, scales }] of Object.entries(panel)) {
    for (const s of scales) {
      const scale = `${block}.${s.path.filter((x) => x !== "*").join(".")}`;
      for (const { name, extra } of MODES) {
        for (const value of s.options) {
          const props = structuredClone({
            id: `${block}-1`,
            ...sample,
            ...extra,
          }) as Record<string, unknown>;
          if (setAt(props, s.path, value) === 0) {
            vacant.push(`${scale} [${name}]`);
            continue;
          }
          cases.push({ block, scale, mode: name, value, def: s.def, props });
        }
      }
    }
  }
  return { cases, vacant: [...new Set(vacant)] };
}

let shared: Browser | null = null;
async function browser(): Promise<Browser> {
  if (shared) return shared;
  try {
    shared = await chromium.launch();
  } catch (bundled) {
    try {
      shared = await chromium.launch({ channel: "chrome" });
    } catch (system) {
      throw new Error(
        `нет браузера для замера: встроенный Chromium — ${String(bundled).slice(0, 200)}; Chrome системы — ${String(system).slice(0, 200)}`,
      );
    }
  }
  return shared;
}

afterAll(async () => {
  await shared?.close();
  shared = null;
});

/** Скрипты секций вон: замер кегля от них не зависит, а гидрация тянула бы сеть. */
const stripScripts = (html: string): string =>
  html.replace(/<script\b[\s\S]*?<\/script>/gi, "");

/**
 * Кегли всех вариантов: страница на блок (варианты одного блока рядом),
 * окно проходит по всем ширинам.
 */
async function measure(
  theme: Theme,
  cases: Case[],
): Promise<{ sizes: Sizes[]; errors: string[] }> {
  const rows = renderSections(
    theme,
    cases.map((c) => ({ block: c.block, props: c.props })),
  );
  const errors = rows
    .map((r, i) =>
      r.html
        ? null
        : `${cases[i].scale}=${cases[i].value} [${cases[i].mode}]: ${r.error ?? (r.missing ? "нет модуля" : "нет html")}`,
    )
    .filter((e): e is string => e !== null);
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
  const byBlock = new Map<string, number[]>();
  cases.forEach((c, i) =>
    byBlock.set(c.block, [...(byBlock.get(c.block) ?? []), i]),
  );
  try {
    for (const idx of byBlock.values()) {
      const body = idx
        .map(
          (i) =>
            `<div data-case="${i}">${stripScripts(rows[i]?.html ?? "")}</div>`,
        )
        .join("\n");
      await page.setContent(
        `<!doctype html><html lang="ru"><head>${head}</head><body>${body}</body></html>`,
        {
          waitUntil: "domcontentloaded",
        },
      );
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const got = await page.evaluate(() => {
          const out: Record<string, Record<string, number>> = {};
          for (const box of Array.from(
            document.querySelectorAll<HTMLElement>("[data-case]"),
          )) {
            const seen: Record<string, number> = {};
            const map: Record<string, number> = {};
            for (const el of Array.from(box.querySelectorAll("*"))) {
              const own = Array.from(el.childNodes)
                .filter((n) => n.nodeType === Node.TEXT_NODE)
                .map((n) => n.textContent ?? "")
                .join("")
                .replace(/\s+/g, " ")
                .trim();
              if (!own || el.getClientRects().length === 0) continue;
              const style = getComputedStyle(el);
              if (style.visibility === "hidden") continue;
              const key = `${el.tagName.toLowerCase()}|${own.slice(0, 32)}`;
              seen[key] = (seen[key] ?? 0) + 1;
              map[`${key}|${seen[key]}`] = parseFloat(style.fontSize);
            }
            out[box.dataset.case ?? ""] = map;
          }
          return out;
        });
        for (const [i, map] of Object.entries(got))
          sizes[Number(i)][width] = map;
      }
    }
  } finally {
    await ctx.close();
  }
  return { sizes, errors };
}

type Verdict = {
  violations: string[];
  details: string[];
  unmeasured: string[];
  cells: number;
  scales: number;
};

/** Порядок вариантов каждого поля в каждом режиме: меньший вариант ≤ большего. */
function judge(cases: Case[], sizes: Sizes[]): Verdict {
  const groups = new Map<string, number[]>();
  cases.forEach((c, i) => {
    const k = `${c.scale}\u0000${c.mode}`;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  });
  const violations = new Set<string>();
  const details: string[] = [];
  const unmeasured: string[] = [];
  let cells = 0;
  for (const idx of groups.values()) {
    const { scale, mode } = cases[idx[0]];
    let compared = 0;
    for (const [n, a] of idx.entries()) {
      for (const b of idx.slice(n + 1)) {
        for (const width of WIDTHS) {
          const small = sizes[a][width] ?? {};
          const big = sizes[b][width] ?? {};
          for (const [key, px] of Object.entries(small)) {
            if (big[key] === undefined) continue;
            compared += 1;
            if (px <= big[key] + 0.01) continue;
            const tag = `${scale}: ${cases[a].value}>${cases[b].value} [${mode}]`;
            if (!violations.has(tag))
              details.push(`${tag} — ${width}px ${key}: ${px} > ${big[key]}`);
            violations.add(tag);
          }
        }
      }
    }
    cells += compared;
    if (compared === 0) unmeasured.push(`${scale} [${mode}]`);
  }
  return {
    violations: [...violations].sort(),
    details,
    unmeasured,
    cells,
    scales: groups.size / MODES.length,
  };
}

/** Индексы случаев по (поле, режим, вариант). */
function indexOf(cases: Case[]): Map<string, number> {
  return new Map(
    cases.map((c, i) => [`${c.scale}\u0000${c.mode}\u0000${c.value}`, i]),
  );
}

/**
 * Узлы, которые поле двигает: хоть в одном режиме хоть на одной ширине кегль
 * узла различается между вариантами. Остальные узлы (цена карточки, соседний
 * заголовок) полю не принадлежат, и признак законно меняет их сам по себе.
 */
function movedKeys(ids: number[], sizes: Sizes[]): Set<string> {
  const moved = new Set<string>();
  for (const width of WIDTHS) {
    const maps = ids.map((i) => sizes[i][width] ?? {});
    for (const key of Object.keys(maps[0] ?? {})) {
      const px = new Set(maps.map((m) => m[key]));
      if (!px.has(undefined as unknown as number) && px.size > 1)
        moved.add(key);
    }
  }
  return moved;
}

/**
 * Явный вариант рисует себя: вне значения по умолчанию признак не меняет
 * кегль узлов, которые двигает поле.
 */
function judgeOwnVariant(cases: Case[], sizes: Sizes[]): string[] {
  const at = indexOf(cases);
  const out = new Set<string>();
  const scales = new Map(cases.map((c) => [c.scale, c]));
  for (const [scale, { def }] of scales) {
    const values = [
      ...new Set(cases.filter((c) => c.scale === scale).map((c) => c.value)),
    ];
    const byMode = MODES.map(({ name }) =>
      values
        .map((v) => at.get(`${scale}\u0000${name}\u0000${v}`))
        .filter((i): i is number => i !== undefined),
    );
    const moved = new Set([
      ...movedKeys(byMode[0], sizes),
      ...movedKeys(byMode[1], sizes),
    ]);
    for (const value of values.filter((v) => v !== def)) {
      const off = at.get(`${scale}\u0000${MODES[0].name}\u0000${value}`);
      const on = at.get(`${scale}\u0000${MODES[1].name}\u0000${value}`);
      if (off === undefined || on === undefined) continue;
      for (const width of WIDTHS) {
        const a = sizes[off][width] ?? {};
        const b = sizes[on][width] ?? {};
        const key = [...moved].find(
          (k) =>
            a[k] !== undefined &&
            b[k] !== undefined &&
            Math.abs(a[k] - b[k]) > 0.01,
        );
        if (!key) continue;
        out.add(
          `${scale}: «${value}» — ${width}px ${key}: без признака ${a[key]}, с признаком ${b[key]}`,
        );
        break;
      }
    }
  }
  return [...out].sort();
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
