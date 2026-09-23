/**
 * «Цвет» в боковой панели фильтров: кольцо выбранного и невыбранного цвета —
 * как на макете «Фильтры/Сбоку» (493:5523), в собранном CSS темы.
 *
 * Прод-замер 23.09 (витрина тестировщика, bloom, шторка «Фильтры и
 * сортировка»): невыбранные цвета обведены цветом текста, а не серым, как
 * радио рядом. Кнопки цвета рисует скрипт каталога порта (`colorOptionHtml`),
 * и два класса кольца оттуда — `border-[rgb(var(--color-muted,…))]` и
 * `after:opacity-100` — в CSS живой витрины не попадают: живая сборка не
 * сканирует packages/theme-<t>/blocks. В превью (свой CSS) всё выглядело верно.
 *
 * Проверка: настоящая `colorOptionHtml` из отрендеренного каталога темы строит
 * кнопки выбранного и невыбранного цвета; победитель каскада для цвета кольца
 * считается в `dist/theme-css/<тема>.css` — это CSS витрины. Невыбранный —
 * роль `--color-muted` (серый), выбранный — `--color-text`.
 *
 * Требует сборки: pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, type HTMLElement } from "node-html-parser";

import { parseRules, winnerIn } from "./lib/css-cascade";

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

/** Кнопка цвета боковой панели так, как её рисует скрипт каталога темы. */
function кольцо(html: string, выбран: boolean): HTMLElement {
  const построить = (0, eval)(
    `(function () {\n${функция(html, "escapeHtml")}\n${функция(html, "colorOptionHtml")}\nreturn colorOptionHtml;\n})()`,
  ) as (value: string, active: boolean, sidebar: boolean) => string;
  const разметка = `<aside data-nt="filter-sidebar"><div><div>${построить("Белый", выбран, true)}</div></div></aside>`;
  const ring = parse(разметка).querySelector(
    '[data-color-option] > span[aria-hidden="true"]',
  );
  if (!ring) throw new Error("у кнопки цвета нет кольца");
  return ring;
}

describe.each(ТЕМЫ)("«Цвет» в боковой панели — %s", (тема) => {
  const html = отрендерить(тема);
  const css = readFileSync(
    resolve(SITES_ROOT, "dist", "theme-css", `${тема}.css`),
    "utf-8",
  );
  const правила = parseRules(css);
  const цвет = (el: HTMLElement) =>
    winnerIn(css, правила, el, "border-color", 375)?.decls["border-color"] ??
    "нет правила (цвет текста)";

  it("невыбранный цвет обведён серым (--color-muted), выбранный — цветом текста", () => {
    expect({
      тема,
      невыбран: цвет(кольцо(html, false)),
      выбран: цвет(кольцо(html, true)),
    }).toEqual({
      тема,
      невыбран: expect.stringContaining("--color-muted"),
      выбран: expect.stringContaining("--color-text"),
    });
  });
});
