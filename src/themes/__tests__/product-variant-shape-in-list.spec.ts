/**
 * Форма образца вариаций в секции «Товар»: «Стиль» × «Вариации».
 *
 * Баг тестировщика (2026-09-14): «В секции Товар при стиль Список и Вариациях
 * квадрат/круг не отображает в списке эти настройки». Панель секции держит два
 * НЕЗАВИСИМЫХ поля (живой puckConfig, подпанель «Варианты»):
 *   • variants.displayStyle — «Стиль»: Кнопка (button) / Список (list);
 *   • variants.shape        — «Вариации»: Круг (circle) / Квадрат (square) / Нет (none).
 * При «Кнопка» форма работала, при «Список» — пропадала вместе с самими
 * образцами: вместо них рисовалась голая выпадашка.
 *
 * Корень — в обоих портах ветка «Списка» не получала форму:
 *   • packages/theme-base/blocks/Product/Product.astro (rose, vanilla, satin,
 *     bloom) схлопывал ДВА поля в один legacy-enum `mode` и передавал только
 *     его. Значение 'list' физически не несёт форму, поэтому ProductVariants
 *     получал shape=undefined → 'none' → выпадашка. Готовая ветка «список со
 *     свотчами» в том же файле была недостижима;
 *   • themes/flux/src/components/sections/FeaturedProduct.astro (flux) при
 *     'list' звал `renderVariantSelectsHtml(groups, selected)` — у функции в
 *     сигнатуре не было параметра формы вовсе.
 *
 * Поэтому сторожим не «есть ли класс формы в файле», а ЭФФЕКТИВНУЮ ФОРМУ
 * образца на живой цепочке рендера: форму темы доставляют разными механизмами
 * (theme-base — утилитой, flux — inline-стилем), и проверка «есть класс» слепа
 * на одном из двух. Радиус утилиты берётся из РЕАЛЬНОГО CSS темы
 * (dist/theme-css/<тема>.css), а не из имени класса.
 *
 * Портов два, авторитет по файлу порта — dist/theme-sections/<тема>/manifest.json.
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections <тема>.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { renderVariantsHtml } from "../../../themes/flux/src/lib/storefront-hydrate";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const STUB = resolve(__dirname, "storefront-variants-stub.mjs");

const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;
const STYLES = ["button", "list"] as const;
const SHAPES = ["circle", "square", "none"] as const;

type Theme = (typeof THEMES)[number];
type Style = (typeof STYLES)[number];

// ───────────────────────── рендер ─────────────────────────

interface RenderResult {
  block: string;
  html?: string;
  error?: string;
  missing?: boolean;
  pipelineError?: string;
}

/**
 * Секция «Товар» темы, полной живой цепочкой (adaptLegacyProps → blockDefaults
 * → resolveBlockProps), тем же скомпилированным портом, что уходит на витрину
 * и в превью. Товар с вариантами приезжает стабом транспорта.
 */
function renderTheme(theme: Theme): Record<string, string> {
  const jobs = [];
  for (const displayStyle of STYLES) {
    for (const shape of SHAPES) {
      jobs.push({
        block: "Product",
        cascade: true,
        live: true,
        props: {
          id: `Product-${displayStyle}-${shape}`,
          productId: "p1",
          siteId: "test-site",
          colorScheme: "1",
          padding: { top: 20, bottom: 20 },
          variants: { displayStyle, shape },
        },
      });
    }
  }
  const raw = execFileSync(
    "node",
    [
      "--import",
      pathToFileURL(STUB).href,
      RENDERER,
      theme,
      JSON.stringify(jobs),
    ],
    { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, cwd: SITES_ROOT },
  );
  const parsed = JSON.parse(raw) as RenderResult[];
  const out: Record<string, string> = {};
  parsed.forEach((r, i) => {
    const displayStyle = STYLES[Math.floor(i / SHAPES.length)];
    const shape = SHAPES[i % SHAPES.length];
    if (!r.html) {
      throw new Error(
        `${theme} ${displayStyle}/${shape}: ${r.error ?? r.pipelineError ?? (r.missing ? "порт не найден" : "нет html")}`,
      );
    }
    out[`${displayStyle}/${shape}`] = r.html;
  });
  return out;
}

// ─────────────────── эффективная форма образца ───────────────────

/** Радиусы утилит темы — из собранного CSS, а не из имени класса. */
function themeRadiusMap(theme: Theme): Map<string, string> {
  const css = readFileSync(
    resolve(SITES_ROOT, `dist/theme-css/${theme}.css`),
    "utf-8",
  );
  const map = new Map<string, string>();
  const re = /\.((?:rounded|mfy)[\w-]*)\s*(?:,[^{]*)?\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const decl = /border-radius\s*:\s*([^;}]+)/.exec(m[2]);
    if (decl && !map.has(m[1])) map.set(m[1], decl[1].trim());
  }
  return map;
}

/** «Круглый», «острый» или «скруглённый прямоугольник» — по значению радиуса. */
function classifyRadius(
  value: string | null,
): "circle" | "square" | "rounded" | null {
  if (value == null) return null;
  const v = value.trim().toLowerCase();
  if (/^0(px|rem|%)?$/.test(v)) return "square";
  if (v.includes("infinity") || v === "50%" || v === "9999px") return "circle";
  const px = /^([\d.]+)px$/.exec(v);
  if (px) return Number(px[1]) >= 999 ? "circle" : "rounded";
  return "rounded";
}

/**
 * Разметка БЕЗ инлайн-скриптов.
 *
 * Калибровка замера: порт flux увозит на страницу собственный клиентский
 * рендерер вариантов, и его ИСХОДНЫЙ ТЕКСТ (шаблонные строки `<select
 * data-variant-select …>`, `background:${hex}`) лежит прямо в `<script>`.
 * Без этой обрезки проверка считала бы выпадашки и пятна цвета, которых в
 * разметке нет — и молча «подтверждала» бы починку.
 */
function stripScripts(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

interface Swatch {
  /** Эффективная форма пятна цвета. */
  shape: "circle" | "square" | "rounded" | null;
  /** Чем форма доехала: inline-стилем или утилитой темы. */
  via: "inline" | "class" | null;
  /** Сырое значение радиуса — для диагностики в падении. */
  radius: string | null;
}

/**
 * Первое ПЯТНО ЦВЕТА в разметке вариантов и его эффективный радиус.
 *
 * Пятно = элемент с заливкой конкретным цветом (`background:#…`): токены схемы
 * (`rgb(var(--color-…))`) так не пишутся, поэтому кнопки и фоны секции сюда не
 * попадают. Нет пятна → форма к значениям не применена вовсе (ровно то, что
 * видел тестировщик в «Списке»).
 */
function firstSwatch(
  rawHtml: string,
  radii: Map<string, string>,
): Swatch | null {
  const html = stripScripts(rawHtml);
  const tagRe = /<(span|button|i|div)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html))) {
    const attrs = m[2];
    const style = /style="([^"]*)"/.exec(attrs)?.[1] ?? "";
    if (!/background\s*:\s*#/i.test(style)) continue;
    const inlineRadius =
      /border-radius\s*:\s*([^;"]+)/.exec(style)?.[1] ?? null;
    if (inlineRadius) {
      return {
        shape: classifyRadius(inlineRadius),
        via: "inline",
        radius: inlineRadius,
      };
    }
    const classes = (/class="([^"]*)"/.exec(attrs)?.[1] ?? "")
      .split(/\s+/)
      .filter(Boolean);
    for (const cls of classes) {
      const value = radii.get(cls);
      if (value)
        return { shape: classifyRadius(value), via: "class", radius: value };
    }
    return { shape: null, via: null, radius: null };
  }
  return null;
}

/** Сколько выпадашек-`<select>` в разметке вариантов. */
function selectCount(html: string): number {
  return (stripScripts(html).match(/<select\b[^>]*data-variant-select/g) ?? [])
    .length;
}

// ───────────────────────── прогон ─────────────────────────

const missingBuild = THEMES.filter(
  (t) =>
    !existsSync(resolve(SITES_ROOT, `dist/theme-sections/${t}/manifest.json`)),
);

const rendered = {} as Record<Theme, Record<string, string>>;
const radii = {} as Record<Theme, Map<string, string>>;
if (missingBuild.length === 0) {
  for (const theme of THEMES) {
    rendered[theme] = renderTheme(theme);
    radii[theme] = themeRadiusMap(theme);
  }
}

describe("Секция «Товар»: форма образца вариаций", () => {
  it("темы собраны (pnpm build:theme-sections)", () => {
    expect(missingBuild).toEqual([]);
  });

  describe.each(THEMES)("%s", (theme) => {
    describe.each(STYLES)("Стиль=%s", (style: Style) => {
      it.each(["circle", "square"] as const)(
        "«Вариации»=%s — образец есть и держит эту форму",
        (shape) => {
          const html = rendered[theme][`${style}/${shape}`];
          const swatch = firstSwatch(html, radii[theme]);
          // Главное: в «Списке» образцы вообще пропадали — оставалась голая
          // выпадашка. Поэтому сначала требуем САМ образец, потом форму.
          expect({ theme, style, shape, swatch }).toMatchObject({
            swatch: expect.objectContaining({ shape }),
          });
        },
      );

      it("«Вариации»=none — значения остаются текстом, пятен цвета нет", () => {
        const html = rendered[theme][`${style}/none`];
        expect(firstSwatch(html, radii[theme])).toBeNull();
      });
    });

    it("«Стиль»=Список + «Вариации»=Нет — выпадашка (канон)", () => {
      expect(selectCount(rendered[theme]["list/none"])).toBeGreaterThan(0);
    });

    it("«Стиль»=Список + форма — образцы вместо голой выпадашки", () => {
      // Отдельным требованием: даже если бы форма «доехала» в разметку рядом с
      // <select>, мерчант всё равно видел бы выпадашку без образцов.
      for (const shape of ["circle", "square"] as const) {
        const html = rendered[theme][`list/${shape}`];
        expect({ shape, selects: selectCount(html) }).toEqual({
          shape,
          selects: 0,
        });
      }
    });

    it("«Стиль» и «Вариации» независимы: форма одинакова в обоих стилях", () => {
      for (const shape of ["circle", "square"] as const) {
        const asButton = firstSwatch(
          rendered[theme][`button/${shape}`],
          radii[theme],
        );
        const asList = firstSwatch(
          rendered[theme][`list/${shape}`],
          radii[theme],
        );
        expect({ shape, button: asButton?.shape, list: asList?.shape }).toEqual(
          {
            shape,
            button: shape,
            list: shape,
          },
        );
      }
    });
  });
});

// ───────────── контракты общих механизмов (оба порта) ─────────────

/** Рендер ОБЩЕГО блока выбора вариантов (theme-base) с произвольными пропами. */
function renderSharedVariants(props: Record<string, unknown>): string {
  const raw = execFileSync(
    "node",
    [resolve(__dirname, "render-product-variants.mjs"), JSON.stringify(props)],
    { encoding: "utf-8", maxBuffer: 16 * 1024 * 1024 },
  );
  const parsed = JSON.parse(raw) as { html?: string; error?: string };
  if (parsed.error) throw new Error(parsed.error);
  return parsed.html ?? "";
}

const SHARED_GROUPS = [
  { key: "Цвет", options: [{ value: "Красный", available: true }] },
  { key: "Размер", options: [{ value: "M", available: true }] },
];

describe("theme-base ProductVariants: форма мерчанта против дефолта темы", () => {
  // Тема умеет форсить выпадашку (`visualConfig.variantsType`), и до правки
  // этот форс стоял ПЕРЕД проверкой формы — настройка панели молча проигрывала
  // дефолту темы. Тот же корень, что у бага «Списка»: решение о выпадашке
  // принималось до того, как форма вообще рассматривалась.
  it.each(["circle", "square"] as const)(
    "тема форсит выпадашку, мерчант выбрал «%s» — побеждает форма",
    (shape) => {
      const html = renderSharedVariants({
        type: "dropdown",
        displayStyle: "list",
        shape,
        groups: SHARED_GROUPS,
      });
      expect(selectCount(html)).toBe(0);
      expect(firstSwatch(html, radii.rose)?.shape).toBe(shape);
    },
  );

  it("тема форсит выпадашку, форма не выбрана — остаётся выпадашка", () => {
    const html = renderSharedVariants({
      type: "dropdown",
      displayStyle: "list",
      shape: "none",
      groups: SHARED_GROUPS,
    });
    expect(selectCount(html)).toBeGreaterThan(0);
  });
});

describe("flux: одна развилка на серверный рендер и живой рефреш", () => {
  // Порт flux рисует варианты дважды — во фронтматтере и в инлайн-скрипте
  // после каждого выбора. Развилка у обоих ОДНА (`renderVariantsHtml`), иначе
  // форма держалась бы только до первого клика. Проверяем саму развилку: это и
  // есть код живого рефреша.

  const groups = [
    { name: "Цвет", values: ["Красный", "Светло-голубой"] },
    { name: "Размер", values: ["M", "L"] },
  ];
  const selected = { Цвет: "Красный", Размер: "M" };

  it.each(["circle", "square"] as const)(
    "Список + «%s» — образцы, не выпадашка",
    (shape) => {
      const html = renderVariantsHtml(groups, selected, "list", shape);
      expect(selectCount(html)).toBe(0);
      expect(firstSwatch(html, radii.flux)?.shape).toBe(shape);
    },
  );

  it("Список + «Нет» — выпадашка (канон)", () => {
    const html = renderVariantsHtml(groups, selected, "list", "none");
    expect(selectCount(html)).toBeGreaterThan(0);
    expect(firstSwatch(html, radii.flux)).toBeNull();
  });

  it.each(["circle", "square"] as const)(
    "Кнопка + «%s» — та же форма",
    (shape) => {
      expect(
        firstSwatch(
          renderVariantsHtml(groups, selected, "button", shape),
          radii.flux,
        )?.shape,
      ).toBe(shape);
    },
  );
});
