/**
 * «Цвет» и «Коллекции» в боковой панели фильтров: кольцо и точка выбранного и
 * невыбранного пункта — как на макете «Фильтры/Сбоку» (493:5523), в собранном
 * CSS темы.
 *
 * Прод-замер 23.09 (витрина тестировщика, bloom, шторка «Фильтры и
 * сортировка»): невыбранные цвета обведены цветом текста, а не серым, как
 * радио рядом. Кнопки цвета и коллекций рисует скрипт каталога порта
 * (`colorOptionHtml`, `collectionOptionHtml`), и часть классов кольца оттуда в
 * CSS живой витрины не попадает: живая сборка не сканирует
 * packages/theme-<t>/blocks. В превью (свой CSS) всё выглядело верно.
 *
 * Локальная сцена 23.09, когда «Коллекции» вернулись в шторку: у satin точка
 * выбранного пункта нулевого размера (её `h-[10px] w-[10px]` в CSS витрины
 * нет), и у выбранной коллекции vanilla точки не было (`after:h-[10px]` из
 * скрипта vanilla в CSS витрины нет). Точку рисуют по-разному: rose, bloom и
 * flux — `::after` кольца, satin — вложенным span, vanilla — радио с классами
 * из filter-classes.ts.
 *
 * Проверка: настоящие `colorOptionHtml` / `collectionOptionHtml` из
 * отрендеренного каталога темы строят пункты — в панели (шторка, «Сбоку») и в
 * блоке коллекций раскладки «Сбоку». Победитель каскада считается в
 * `dist/theme-css/<тема>.css` — это CSS витрины. Невыбранный — кольцо
 * `--color-muted`, точки нет; выбранный — кольцо `--color-text` и видимая
 * точка 10px. Для vanilla — все классы радио, которые рисует её скрипт, есть в
 * CSS витрины.
 *
 * Требует сборки: pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, type HTMLElement } from "node-html-parser";

import { parseRules, winnerIn, type Rule } from "./lib/css-cascade";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const ТЕМЫ = ["rose", "bloom", "satin", "flux"] as const;

function отрендерить(тема: string): string {
  const jobs = [
    {
      block: "Catalog",
      cascade: true,
      live: true,
      props: { id: "Catalog-guard", siteId: "test-site", colorScheme: "1" },
    },
  ];
  const raw = execFileSync("node", [RENDERER, тема, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const row = (JSON.parse(raw) as Record<string, string>[])[0];
  if (row.html === undefined) throw new Error(`${тема}: рендер без HTML`);
  return row.html;
}

/** Тело функции `function имя(…) { … }` из текста скрипта — по скобкам. */
function функция(код: string, имя: string): string {
  const начало = код.indexOf(`function ${имя}(`);
  if (начало < 0) throw new Error(`нет функции ${имя}`);
  let i = код.indexOf("{", начало);
  let глубина = 0;
  for (; i < код.length; i++) {
    if (код[i] === "{") глубина++;
    if (код[i] === "}" && --глубина === 0) break;
  }
  return код.slice(начало, i + 1);
}

type Построить = (выбран: boolean) => string;

/** Пункты панели так, как их рисует скрипт каталога темы. */
function пункты(html: string): { цвет: Построить; коллекция: Построить } {
  const { colorOptionHtml, collectionOptionHtml } = (0, eval)(
    `(function () {\n${функция(html, "escapeHtml")}\n${функция(html, "colorOptionHtml")}\n${функция(html, "collectionOptionHtml")}\nreturn { colorOptionHtml, collectionOptionHtml };\n})()`,
  ) as {
    colorOptionHtml: (
      value: string,
      active: boolean,
      sidebar: boolean,
    ) => string;
    collectionOptionHtml: (
      value: string,
      name: string,
      active: boolean,
      sidebar: boolean,
    ) => string;
  };
  return {
    цвет: (выбран) => colorOptionHtml("Белый", выбран, true),
    коллекция: (выбран) => collectionOptionHtml("leto", "Лето", выбран, true),
  };
}

/** Где пункт живёт: панель (шторка, «Сбоку») и блок коллекций «Сбоку». */
const МЕСТА = {
  панель: (x: string) =>
    `<aside data-nt="filter-sidebar"><div><div>${x}</div></div></aside>`,
  блокКоллекций: (x: string) =>
    `<div data-nt="catalog-collections-filter" data-collections-style="sidebar"><ul>${x}</ul></div>`,
};

function кольцо(разметка: string): HTMLElement {
  const ring = parse(разметка).querySelector(
    ':is([data-color-option], [data-collection-option]) > span[aria-hidden="true"]',
  );
  if (!ring) throw new Error("у пункта нет кольца");
  return ring;
}

/** 0…1 из `opacity` («100%» → 1). */
const непрозрачность = (v: string | undefined) =>
  v === undefined
    ? 1
    : v.trim().endsWith("%")
      ? parseFloat(v) / 100
      : parseFloat(v);

describe.each(ТЕМЫ)("«Цвет» и «Коллекции» в боковой панели — %s", (тема) => {
  const html = отрендерить(тема);
  const css = readFileSync(
    resolve(SITES_ROOT, "dist", "theme-css", `${тема}.css`),
    "utf-8",
  );
  const правила = parseRules(css);
  // Правила `…::after` — к самому кольцу: так считается победитель у точки.
  const правилаAfter: Rule[] = правила
    .filter((r) => /::after$/.test(r.selector))
    .map((r) => ({ ...r, selector: r.selector.replace(/::after$/, "") }));
  const постройка = пункты(html);

  const победитель = (el: HTMLElement, свойство: string, после = false) =>
    winnerIn(css, после ? правилаAfter : правила, el, свойство, 375)?.decls[
      свойство
    ];

  /** Точка кольца, как её видит покупатель: размер и видна ли. */
  function точка(ring: HTMLElement) {
    const вложенная = ring.querySelector("span");
    const el = вложенная ?? ring;
    const после = !вложенная;
    const содержимое = после ? победитель(ring, "content", true) : "есть";
    const ширина = победитель(el, "width", после) ?? "нет";
    const видна =
      !!содержимое &&
      содержимое !== "none" &&
      ширина !== "нет" &&
      непрозрачность(победитель(el, "opacity", после)) === 1;
    return { ширина, видна };
  }

  describe.each(Object.keys(постройка) as Array<keyof typeof постройка>)(
    "%s",
    (пункт) => {
      const места =
        пункт === "коллекция"
          ? (["панель", "блокКоллекций"] as const)
          : (["панель"] as const);

      it.each(места)(
        "%s: невыбранный — серое кольцо без точки, выбранный — кольцо цвета текста с точкой 10px",
        (место) => {
          const idle = кольцо(МЕСТА[место](постройка[пункт](false)));
          const on = кольцо(МЕСТА[место](постройка[пункт](true)));
          expect({
            невыбран: {
              кольцо: победитель(idle, "border-color") ?? "нет правила",
              точка: точка(idle).видна,
            },
            выбран: {
              кольцо: победитель(on, "border-color") ?? "нет правила",
              точка: точка(on),
            },
          }).toEqual({
            невыбран: {
              кольцо: expect.stringContaining("--color-muted"),
              точка: false,
            },
            выбран: {
              кольцо: expect.stringContaining("--color-text"),
              точка: { ширина: "10px", видна: true },
            },
          });
        },
      );
    },
  );
});

/** Есть ли в CSS правило для класса (селектор с экранированием Tailwind). */
function естьКласс(css: string, класс: string): boolean {
  const экран = класс.replace(/[^\w-]/g, (c) => `\\${c}`);
  return new RegExp(
    `\\.${экран.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`,
  ).test(css);
}

describe("vanilla: радио «Коллекций» и «Цвета», которые рисует скрипт, — в CSS витрины", () => {
  it("каждый класс кольца, точки и подписи есть в dist/theme-css/vanilla.css", () => {
    const html = отрендерить("vanilla");
    const константа = (имя: string) => {
      const m = new RegExp(`const ${имя} =\\s*"([^"]+)"`).exec(html);
      if (!m) throw new Error(`в скрипте vanilla нет ${имя}`);
      return m[1].split(/\s+/);
    };
    const css = readFileSync(
      resolve(SITES_ROOT, "dist", "theme-css", "vanilla.css"),
      "utf-8",
    );
    const классы = [...константа("RADIO_CIRCLE"), ...константа("RADIO_TEXT")];
    expect({
      классов: классы.length > 10,
      нетВCss: классы.filter((к) => !естьКласс(css, к)),
    }).toEqual({ классов: true, нетВCss: [] });
  });
});
