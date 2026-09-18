/**
 * Rose /catalog на мобиле: фильтры и сортировка сворачиваются в ОДНУ строку
 * «Фильтры и сортировка (N)» со счётчиком, которая открывает нижнюю панель —
 * КАК на эталоне rose.merfy.ru/catalog (сайт верстальщиков, канон вёрстки).
 *
 * Жалоба владельца (2026-09-18): «Адаптив фильтров и сортировки взять из
 * rose». На эталоне на ширинах <lg (Tailwind breakpoint 1024px) вместо строки
 * details-дропдаунов показывается один триггер с текстом «Фильтры и
 * сортировка» и счётчиком применённых фильтров в скобках; сама строка
 * дропдаунов и панель фильтров (`#rose-filters-sheet`) скрыты классом Tailwind
 * `hidden`/`lg:flex` до явного открытия.
 *
 * ЭТОТ ГАРД проверяет РЕАЛЬНЫЙ рендер блока Catalog темы rose (тот же модуль,
 * что отдаёт витрина/превью — dist/theme-sections/rose через
 * render-theme-sections.mjs), а не исходный .astro текст:
 *   1) строка десктопных details-дропдаунов помечена `hidden` (скрыта по
 *      умолчанию, видна только от `lg:`) — регресс «фильтры снова
 *      развернутся в полный список» на мобиле = кто-то вернул class="flex"
 *      без hidden/lg:flex;
 *   2) существует ровно один мобильный триггер `[data-filters-open]` с
 *      текстом «Фильтры и сортировка» и элемент-счётчик `[data-filters-count]`
 *      внутри него — регресс «счётчик пропал» = триггер/счётчик убрали из
 *      разметки;
 *   3) существует панель `#rose-filters-sheet` (`role="dialog"`), скрытая по
 *      умолчанию классом `hidden`, содержащая реальные контролы фильтра
 *      (`[data-nt="filter-sidebar"]`) — а не пустышку;
 *   4) инлайн-скрипт секции содержит биндинг открытия/закрытия
 *      (`data-filters-open`/`data-filters-close`/`data-filters-apply`) и
 *      расчёт счётчика (`syncMobileFilterCount`/`data-filters-count`) — без
 *      этого триггер визуально есть, но клик не открывает панель (ровно баг
 *      из жалобы: «мой клик по строке панель не открыл»).
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

  test("строка details-дропдаунов скрыта на мобиле (hidden, видна только lg:)", () => {
    const bars = root.querySelectorAll('[data-nt="catalog-filters"]');
    expect(bars.length).toBeGreaterThanOrEqual(1);
    const cls = bars[0].getAttribute("class") ?? "";
    expect(cls.split(/\s+/)).toContain("hidden");
    // должен быть явный десктопный «включатель» — иначе hidden скрывает и на lg+
    expect(/(^|\s)lg:(flex|grid|block|inline-flex)(\s|$)/.test(cls)).toBe(true);
  });

  test("мобильный триггер «Фильтры и сортировка» существует со счётчиком", () => {
    const triggers = root.querySelectorAll("[data-filters-open]");
    expect(triggers.length).toBe(1);
    const trigger = triggers[0];
    expect(trigger.getAttribute("aria-controls")).toBe("rose-filters-sheet");
    expect(trigger.text.replace(/\s+/g, " ")).toContain("Фильтры и сортировка");
    // счётчик — отдельный узел внутри триггера, регресс «счётчик пропал» ловится тут
    const count = trigger.querySelectorAll("[data-filters-count]");
    expect(count.length).toBe(1);
  });

  test("панель #rose-filters-sheet существует, скрыта по умолчанию, содержит реальные контролы фильтра", () => {
    const sheet = root.querySelector("#rose-filters-sheet");
    expect(sheet).not.toBeNull();
    const cls = sheet!.getAttribute("class") ?? "";
    expect(cls.split(/\s+/)).toContain("hidden");
    expect(sheet!.getAttribute("role")).toBe("dialog");
    const sidebarInside = sheet!.querySelectorAll('[data-nt="filter-sidebar"]');
    expect(sidebarInside.length).toBeGreaterThanOrEqual(1);
    // кнопки «Показать»/«Закрыть» открытой панели — как на эталоне
    expect(sheet!.querySelectorAll("[data-filters-apply]").length).toBe(1);
    expect(sheet!.querySelectorAll("[data-filters-close]").length).toBeGreaterThanOrEqual(1);
  });

  test("инлайн-скрипт секции реально открывает/закрывает панель и считает счётчик", () => {
    // Баг из жалобы: «мой клик по строке панель не открыл» — обработчик был
    // не на том узле/отсутствовал. Сторожим, что и открытие, и подсчёт
    // РЕАЛЬНО есть в отданном браузеру скрипте, а не просто в разметке.
    expect(html).toContain("data-filters-open");
    expect(html).toContain("data-filters-close");
    expect(html).toContain("data-filters-apply");
    expect(html).toContain("rose-filters-sheet");
    expect(html).toContain("syncMobileFilterCount");
    expect(html).toContain("data-filters-count");
  });
});
