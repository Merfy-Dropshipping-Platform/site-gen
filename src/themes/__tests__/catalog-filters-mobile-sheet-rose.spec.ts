/**
 * Rose /catalog на мобиле: фильтры и сортировка сворачиваются в ОДНУ строку
 * «Фильтры и сортировка (N)» со счётчиком, которая открывает шторку — КАК на
 * эталоне rose.merfy.ru/catalog (сайт верстальщиков, канон вёрстки).
 *
 * Жалоба владельца (2026-09-18): «Адаптив фильтров и сортировки взять из
 * rose». Тогда в шторку положили отдельный сайдбар с радио.
 *
 * 23.09 владелец: «адаптив мобилы взять с вёрстки», и следом макет
 * «Фильтры/Сбоку» (493:5523): «вот как должно быть в мобильных фильтрах, в
 * каждой теме». Кнопка и шторка под шапкой — из вёрстки (RoseFiltersSheet),
 * внутри — боковая панель фильтров со своими именами радио. Строка выпадашек
 * ниже lg прячется (data-filters-sheet-below="lg"), от lg шторка скрыта.
 * Поведение шторки (открыть, закрыть, Esc, замок прокрутки) для пяти тем
 * сторожит catalog-filters-sheet.spec.ts; здесь — своё у rose: счётчик «(N)».
 *
 * ЭТОТ ГАРД проверяет РЕАЛЬНЫЙ рендер блока Catalog темы rose (тот же модуль,
 * что отдаёт витрина/превью — dist/theme-sections/rose через
 * render-theme-sections.mjs), а не исходный .astro текст:
 *   1) строка details-дропдаунов одна, вне шторки и ниже lg прячется
 *      (data-filters-sheet-below="lg") — регресс «строка снова развернулась
 *      на мобиле» = атрибут потеряли;
 *   2) существует ровно один мобильный триггер `[data-filters-open]` с
 *      текстом «Фильтры и сортировка» и элемент-счётчик `[data-filters-count]`
 *      внутри него;
 *   3) шторка (`role="dialog"`) скрыта по умолчанию классом `hidden`, от lg
 *      скрыта целиком (lg:hidden!), несёт боковую панель и «Показать»/«Закрыть»;
 *   4) инлайн-скрипт секции открывает/закрывает шторку (общий скрипт
 *      `__merfyFiltersSheet`) и считает счётчик (`syncMobileFilterCount`).
 *
 * Требует сборки (тот же порядок, что в CI):
 *   pnpm build && pnpm build:blocks && pnpm build:theme-sections:all && pnpm build:preview-tailwind
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parse } from "node-html-parser";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");

function renderRoseCatalog(): string {
  const jobs = [
    {
      block: "Catalog",
      cascade: true,
      live: true,
      props: {
        id: "Catalog-mobile-sheet-guard",
        siteId: "test-site",
        colorScheme: "1",
        padding: { top: 40, bottom: 40 },
      },
    },
  ];
  const raw = execFileSync("node", [RENDERER, "rose", JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const row = (JSON.parse(raw) as Record<string, string>[])[0];
  if (row.html === undefined) {
    throw new Error(
      `рендер «Каталог» (rose) не дал HTML: ${JSON.stringify(row).slice(0, 300)}`,
    );
  }
  return row.html;
}

describe("rose /catalog: мобильный адаптив фильтров и сортировки (эталон rose.merfy.ru)", () => {
  const html = renderRoseCatalog();
  const root = parse(html);

  test("строка details-дропдаунов одна, вне шторки и ниже lg прячется", () => {
    const bars = root.querySelectorAll('[data-nt="catalog-filters"]');
    expect(bars.length).toBe(1);
    expect(bars[0].closest("[data-filters-sheet]")).toBeNull();
    expect(bars[0].getAttribute("data-filters-sheet-below")).toBe("lg");
  });

  test("мобильный триггер «Фильтры и сортировка» существует со счётчиком", () => {
    const triggers = root.querySelectorAll("[data-filters-open]");
    expect(triggers.length).toBe(1);
    const trigger = triggers[0];
    const sheet = root.querySelector("[data-filters-sheet]");
    expect(trigger.getAttribute("aria-controls")).toBe(
      sheet?.getAttribute("id"),
    );
    expect(trigger.text.replace(/\s+/g, " ")).toContain("Фильтры и сортировка");
    // счётчик — отдельный узел внутри триггера, регресс «счётчик пропал» ловится тут
    const count = trigger.querySelectorAll("[data-filters-count]");
    expect(count.length).toBe(1);
  });

  test("шторка скрыта по умолчанию и несёт боковую панель и «Показать»/«Закрыть»", () => {
    const sheet = root.querySelector("[data-filters-sheet]");
    expect(sheet).not.toBeNull();
    const cls = sheet!.getAttribute("class") ?? "";
    expect(cls.split(/\s+/)).toContain("hidden");
    expect(cls.split(/\s+/)).toContain("lg:hidden!");
    expect(sheet!.getAttribute("role")).toBe("dialog");
    expect(sheet!.querySelectorAll('[data-nt="filter-sidebar"]').length).toBe(
      1,
    );
    expect(sheet!.querySelectorAll("[data-filters-apply]").length).toBe(1);
    expect(
      sheet!.querySelectorAll("[data-filters-close]").length,
    ).toBeGreaterThanOrEqual(1);
  });

  test("инлайн-скрипт секции открывает/закрывает шторку и считает счётчик", () => {
    // Сторожим, что и открытие, и подсчёт РЕАЛЬНО есть в отданном браузеру
    // скрипте, а не просто в разметке.
    expect(html).toContain("__merfyFiltersSheet");
    expect(html).toContain("syncMobileFilterCount");
    expect(html).toContain("data-filters-count");
  });
});
