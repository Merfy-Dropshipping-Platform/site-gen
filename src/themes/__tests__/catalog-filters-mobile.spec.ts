/**
 * Каталог на узком экране: панель фильтра не уезжает за экран, область нажатия ≥ 44px.
 *
 * Два бага владельца (2026-09-14, тема rose, 375px, страница каталога):
 *   1. «Выпадающая панель фиксированной ширины 180px привязана к левому краю
 *      своего фильтра, поэтому у "Цвета" её правый край уходит на 405 при экране
 *      375 — названия цветов обрезаны, страница уезжает вбок на 30px.»
 *   2. «Высота всех элементов 16px … Ожидаемый результат: высота области нажатия
 *      не меньше 44px.»
 *
 * ЗАМЕР «ДО» (живые стенды, Chromium 375×812, isMobile+hasTouch, 2026-09-14),
 * 42 проверки по пяти темам, 24 красных:
 *
 *   тема     тап-таргеты <44px   панель вылезла за экран
 *   rose        5 из 5           «Цвет»: правый край 461, scrollWidth 461 (уезд +86)
 *   vanilla     4 из 4           «Коллекции»: 476; «По популярности»: левый край −84
 *   bloom       4 из 4 (40px)    —
 *   satin       4 из 4 (32px)    — (запас у «Стоимость» 32px)
 *   flux        4 из 4 (40px)    —
 *
 * Болезнь общая: строка фильтров одинакова во всех пяти форках
 * packages/theme-<t>/blocks/Catalog/Catalog.astro. Поэтому и лечение общее —
 * packages/theme-base/styles/catalog-filters.css, который подключают все пять
 * themes/<t>/src/styles/global.css.
 *
 * ЧТО СТОРОЖИМ. Не «есть ли строка в файле», а победителя каскада в РЕАЛЬНОМ
 * бандле темы (dist/theme-css/<тема>.css) для РЕАЛЬНЫХ узлов из рендера секции
 * (dist/theme-sections/<тема>). Проверка «есть класс/есть правило» слепа к тому,
 * что утилита Tailwind перебьёт правило: и утилиты, и наше правило лежат в
 * @layer utilities, там решает специфичность.
 *
 * Три несущие вещи (каждая проверена замером выше):
 *   1) `<details>` не является содержащим блоком (position: static) — иначе
 *      `left: 0` снова считается от отдельного фильтра и панель вылезает;
 *   2) у панели `top: auto` (НЕ 100%) — статическая позиция держит панель под
 *      своим триггером; с `top: 100%` отрыв вырастает до 60–172px (bloom/flux);
 *   3) `min-height` триггера ≥ 44px в узком/тач-контексте.
 *
 * Требует сборки (тот же порядок, что в CI):
 *   pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, type HTMLElement } from "node-html-parser";

import {
  parseRules,
  winnerIn,
  type Rule,
} from "./lib/css-cascade";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SHARED_CSS = resolve(
  SITES_ROOT,
  "packages",
  "theme-base",
  "styles",
  "catalog-filters.css",
);

const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;
type Theme = (typeof THEMES)[number];

/** Стандарт тап-таргета (Apple HIG 44pt); число из требования владельца. */
const MIN_TAP_PX = 44;
/** Узкий экран замера. */
const NARROW_PX = 375;

// ─────────────────────────── рендер секции ───────────────────────────

const htmlCache = new Map<Theme, string>();

/** Секция «Каталог» темы — тем же модулем, что отдаёт витрина. */
function renderCatalog(theme: Theme): string {
  const ready = htmlCache.get(theme);
  if (ready !== undefined) return ready;
  const jobs = [
    {
      block: "Catalog",
      cascade: true,
      live: true,
      props: {
        id: "Catalog-guard",
        siteId: "test-site",
        colorScheme: "1",
        padding: { top: 40, bottom: 40 },
      },
    },
  ];
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const row = (JSON.parse(raw) as Record<string, string>[])[0];
  if (row.html === undefined) {
    throw new Error(
      `рендер «Каталог» (${theme}) не дал HTML: ${JSON.stringify(row).slice(0, 300)}`,
    );
  }
  htmlCache.set(theme, row.html);
  return row.html;
}

/** Строка фильтров top-вида. Сайдбар этого атрибута не несёт. */
function filterBar(theme: Theme): HTMLElement {
  const bars = parse(renderCatalog(theme)).querySelectorAll(
    '[data-nt="catalog-filters"]',
  );
  if (bars.length !== 1) {
    throw new Error(
      `${theme}: ожидали одну строку [data-nt="catalog-filters"], нашли ${bars.length}`,
    );
  }
  return bars[0];
}

/** Триггер + его панель для каждого фильтра/сортировки строки. */
function dropdowns(theme: Theme): {
  label: string;
  summary: HTMLElement;
  panel: HTMLElement;
}[] {
  return filterBar(theme)
    .querySelectorAll("details")
    .map((d) => {
      const summary = d.querySelector("summary");
      const panel = d.childNodes.find(
        (n): n is HTMLElement =>
          (n as HTMLElement).tagName !== undefined &&
          (n as HTMLElement).tagName !== "SUMMARY",
      );
      if (!summary || !panel) {
        throw new Error(
          `${theme}: у <details> нет summary или панели — ${d.toString().slice(0, 160)}`,
        );
      }
      return {
        label: summary.textContent.trim().replace(/\s+/g, " ").slice(0, 24),
        summary,
        panel,
      };
    });
}

// ──────────────────── мини-каскад по реальному бандлу ────────────────────
//
// Движок каскада (разбор бандла, слои, специфичность, победитель) вынесен в
// общий src/themes/__tests__/lib/css-cascade.ts — его же использует гард
// раскладок каталога (catalog-layout-mobile.spec.ts). Держать вторую копию
// здесь значило бы повторить ровно ту болезнь, которую чинил тот гард.

const cssCache = new Map<Theme, string>();
const rulesCache = new Map<Theme, Rule[]>();

/** Реальный бандл темы: ровно его грузит витрина и превью. */
function themeCss(theme: Theme): string {
  const ready = cssCache.get(theme);
  if (ready !== undefined) return ready;
  const text = readFileSync(
    resolve(SITES_ROOT, "dist", "theme-css", `${theme}.css`),
    "utf-8",
  );
  cssCache.set(theme, text);
  return text;
}

function themeRules(theme: Theme): Rule[] {
  const ready = rulesCache.get(theme);
  if (ready) return ready;
  const rules = parseRules(themeCss(theme));
  rulesCache.set(theme, rules);
  return rules;
}

/** Правило пришло из общего файла, а не из утилиты Tailwind. */
const fromSharedFile = (r: Rule | null) =>
  !!r && r.selector.includes('[data-nt="catalog-filters"]');

/** Победитель каскада для узла на узком экране (375px) — общий движок. */
function winner(theme: Theme, el: HTMLElement, prop: string) {
  return winnerIn(themeCss(theme), themeRules(theme), el, prop, NARROW_PX);
}

const built = (theme: Theme) =>
  existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  ) && existsSync(resolve(SITES_ROOT, "dist", "theme-css", `${theme}.css`));

// ───────────────────────────── общий источник ─────────────────────────────

describe("лечение — в общем месте, а не в порте одной темы", () => {
  it("общий файл существует", () => {
    expect(existsSync(SHARED_CSS)).toBe(true);
  });

  it.each(THEMES)("%s подключает общий файл", (theme) => {
    const entry = readFileSync(
      resolve(SITES_ROOT, "themes", theme, "src", "styles", "global.css"),
      "utf-8",
    );
    expect(entry).toContain('packages/theme-base/styles/catalog-filters.css"');
  });

  it("правила общего файла лежат в @layer utilities (иначе их перебьют утилиты)", () => {
    const rules = parseRules(readFileSync(SHARED_CSS, "utf-8")).filter((r) =>
      r.selector.includes("catalog-filters"),
    );
    expect(rules.length).toBeGreaterThanOrEqual(3);
    for (const r of rules) expect(r.layer).toBe("utilities");
  });
});

// ─────────────────────── контракт разметки строки ───────────────────────

describe.each(THEMES)("каталог / %s: разметка строки фильтров", (theme) => {
  it("секции темы собраны (pnpm build:theme-sections:all)", () => {
    expect(built(theme)).toBe(true);
  });

  it("строка фильтров одна и она — содержащий блок (position: relative)", () => {
    const bar = filterBar(theme);
    expect(winner(theme, bar, "position")?.decls.position).toBe("relative");
  });

  it("у каждого фильтра есть <summary> и ровно одна позиционированная панель", () => {
    const list = dropdowns(theme);
    expect(list.length).toBeGreaterThanOrEqual(3);
    for (const { label, panel } of list) {
      expect(
        `${label}: ${winner(theme, panel, "position")?.decls.position}`,
      ).toBe(`${label}: absolute`);
    }
  });
});

// ──────────────── баг 1: панель не уезжает за правый край ────────────────

describe.each(THEMES)(
  `каталог / %s: панель фильтра прижата к контейнеру на ${NARROW_PX}px`,
  (theme) => {
    it("<details> перестаёт быть содержащим блоком", () => {
      for (const d of filterBar(theme).querySelectorAll("details")) {
        const win = winner(theme, d, "position");
        expect(`${win?.decls.position} / общий=${fromSharedFile(win)}`).toBe(
          "static / общий=true",
        );
      }
    });

    it("панель отсчитывается от левого края строки, а не своего фильтра", () => {
      for (const { label, panel } of dropdowns(theme)) {
        // именно «победил общий файл»: у `.left-0` значение такое же, и
        // проверка «left === 0» была бы зелёной даже когда выигрывает утилита
        const left = winner(theme, panel, "left");
        expect(
          `${label}: ${left?.decls.left} / общий=${fromSharedFile(left)}`,
        ).toBe(`${label}: 0 / общий=true`);
        const right = winner(theme, panel, "right");
        expect(
          `${label}: ${right?.decls.right} / общий=${fromSharedFile(right)}`,
        ).toBe(`${label}: auto / общий=true`);
      }
    });

    it("панель шире строки быть не может", () => {
      for (const { label, panel } of dropdowns(theme)) {
        const win = winner(theme, panel, "max-width");
        expect(
          `${label}: ${win?.decls["max-width"]} / общий=${fromSharedFile(win)}`,
        ).toBe(`${label}: 100% / общий=true`);
      }
    });

    it("вертикаль держится статической позицией: top = auto, НЕ 100%", () => {
      for (const { label, panel } of dropdowns(theme)) {
        const win = winner(theme, panel, "top");
        expect(
          `${label}: ${win?.decls.top} / общий=${fromSharedFile(win)}`,
        ).toBe(`${label}: auto / общий=true`);
      }
    });
  },
);

// ───────────────────── баг 2: область нажатия ≥ 44px ─────────────────────

describe.each(THEMES)(
  `каталог / %s: область нажатия фильтра ≥ ${MIN_TAP_PX}px`,
  (theme) => {
    it("у каждого триггера min-height не меньше нормы", () => {
      for (const { label, summary } of dropdowns(theme)) {
        const win = winner(theme, summary, "min-height");
        const px = win ? parseFloat(win.decls["min-height"]) : 0;
        expect(`${label}: ${px}px / общий=${fromSharedFile(win)}`).toBe(
          `${label}: ${MIN_TAP_PX}px / общий=true`,
        );
      }
    });

    it("триггер центрирует подпись, а не растягивает её", () => {
      for (const { label, summary } of dropdowns(theme)) {
        const win = winner(theme, summary, "align-items");
        expect(
          `${label}: ${win?.decls["align-items"]} / общий=${fromSharedFile(win)}`,
        ).toBe(`${label}: center / общий=true`);
      }
    });
  },
);
