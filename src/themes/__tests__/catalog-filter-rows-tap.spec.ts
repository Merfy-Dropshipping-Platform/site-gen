/**
 * Строки-варианты ВНУТРИ раскрытой панели фильтра каталога: область нажатия ≥ 44px.
 *
 * Жалоба тестировщика (2026-09-14): «в фильтрах каталога на мобильном цели
 * нажатия мельче 44px, худшие 16px». Правка 5afaf16c подняла до 44px ТОЛЬКО
 * триггеры `<summary>` — строки внутри панелей остались прежними, и жалоба
 * осталась незакрытой.
 *
 * ЗАМЕР «ДО» (живые стенды на образе 5afaf16c, Chromium 375×812, isMobile+
 * hasTouch, панели раскрыты, 2026-09-15; кандидат — самый внутренний узел из
 * p/li/label/button/a/input/select/[role=…] и строк цены, sr-only 1×1 отброшены):
 *
 *   тема     найдено   строк <44px   худшая
 *   rose        14         14          14px
 *   vanilla     13         13          16px   ← то самое «16px» из жалобы
 *   bloom       11         11          14px
 *   satin        9          9          14px
 *   flux         0          0           —     каталог на 375px пуст (чужой баг)
 *
 * ЗАМЕР «ПОСЛЕ» (там же, правило вложено в существующий @layer utilities):
 * 0 из 14 / 0 из 13 / 0 из 11 / 0 из 9, худшая 44px; ширина каждой панели и её
 * правый край не изменились ни на пиксель, document.scrollWidth = 375.
 *
 * ЧТО СТОРОЖИМ. Не «есть ли строка в файле», а победителя каскада в РЕАЛЬНОМ
 * бандле темы (dist/theme-css/<тема>.css) для РЕАЛЬНЫХ узлов из рендера секции
 * (dist/theme-sections/<тема>). Проверка «есть класс/есть правило» слепа к тому,
 * что утилита Tailwind перебьёт правило: и утилиты, и наше правило лежат в
 * @layer utilities, там решает специфичность.
 *
 * ГИДРАЦИЯ. Половину строк печатает инлайн-скрипт секции уже в браузере
 * (коллекции, реальные цвета) — в статическом рендере их нет. Поэтому шаблоны
 * этих строк берём ИЗ ИСХОДНИКА темы (packages/theme-<t>/blocks/Catalog/
 * Catalog.astro), прививаем в настоящую панель настоящего дерева и считаем тем
 * же каскадом. Свою фикстуру не сочиняем: поменяется вёрстка гидрации —
 * поменяется и то, что проверяется.
 *
 * ИНЛАЙН-СТИЛИ. Каскад учитывает атрибут `style` узла: инлайн сильнее любого
 * правила без `!important`. Без этого подмена `style="min-height:0"` оставила бы
 * проверку зелёной (дыра, найденная на соседнем гарде). Способность живёт в
 * общем движке src/themes/__tests__/lib/css-cascade.ts — вместе с разбором
 * запятых внутри `:is(…)` и специфичностью `:is()` по сильнейшему аргументу;
 * своей копии движка у этого гарда нет.
 *
 * Требует сборки (тот же порядок, что в CI):
 *   pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, type HTMLElement } from "node-html-parser";

import {
  INLINE_SELECTOR,
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
/** Узкий экран замера. Опора — константа, не window.innerWidth. */
const NARROW_PX = 375;

/** Селектор строки-варианта внутри панели — ровно набор из общего файла. */
const ROW_SELECTOR = [
  "p",
  "li",
  "label",
  "button",
  "a",
  '[data-nt="filter-price-rows"] > div',
  '[data-nt="catalog-price"] > div',
]
  .map((s) => `:scope ${s}`)
  .join(", ");

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
        id: "Catalog-rows-guard",
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

const treeCache = new Map<Theme, HTMLElement>();

/** Дерево секции. Один разбор на тему: в него же прививаются шаблоны гидрации. */
function tree(theme: Theme): HTMLElement {
  const ready = treeCache.get(theme);
  if (ready) return ready;
  const root = parse(renderCatalog(theme));
  treeCache.set(root ? theme : theme, root);
  return root;
}

/** Строка фильтров top-вида. Сайдбар этого атрибута не несёт. */
function filterBar(theme: Theme): HTMLElement {
  const bars = tree(theme).querySelectorAll('[data-nt="catalog-filters"]');
  if (bars.length !== 1) {
    throw new Error(
      `${theme}: ожидали одну строку [data-nt="catalog-filters"], нашли ${bars.length}`,
    );
  }
  return bars[0];
}

/** Панели фильтров (всё, что внутри <details> и не <summary>). */
function panels(theme: Theme): { label: string; panel: HTMLElement }[] {
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
        panel,
      };
    });
}

/** Строки-варианты из статического рендера: самый внутренний кандидат. */
function staticRows(theme: Theme): { label: string; el: HTMLElement }[] {
  const out: { label: string; el: HTMLElement }[] = [];
  for (const { label, panel } of panels(theme)) {
    const found = panel.querySelectorAll(ROW_SELECTOR);
    const inner = found.filter(
      (el) => !found.some((o) => o !== el && el !== o && isAncestor(el, o)),
    );
    for (const el of inner) out.push({ label, el });
  }
  return out;
}

const isAncestor = (a: HTMLElement, b: HTMLElement): boolean => {
  let p = b.parentNode as HTMLElement | null;
  while (p) {
    if (p === a) return true;
    p = p.parentNode as HTMLElement | null;
  }
  return false;
};

// ───────────────── шаблоны строк, которые печатает гидрация ─────────────────

/**
 * HTML-шаблоны строк из инлайн-скрипта секции.
 *
 * Берём КАЖДЫЙ бэктик-литерал темы, где встречается `data-collection-option=`
 * или `data-color-option=` (у каждой темы их по два — вариант дропдауна и
 * вариант сайдбара), и выбрасываем `${…}`-вставки. Дальше шаблон прививается в
 * настоящую панель настоящего дерева, чтобы каскад считался в том же контексте.
 *
 * vanilla с 23.09 печатает строки «Коллекций» и «Цвета» одним помощником
 * (choiceButtonHtml / choiceRadioHtml): имя атрибута приходит из описания
 * фильтра — `${kind.attr}=`. Такие литералы тоже шаблоны строк.
 */
function hydrationRowTemplates(theme: Theme): string[] {
  const src = readFileSync(
    resolve(
      SITES_ROOT,
      "packages",
      `theme-${theme}`,
      "blocks",
      "Catalog",
      "Catalog.astro",
    ),
    "utf-8",
  );
  const out: string[] = [];
  const re =
    /`([^`]*(?:data-collection-option=|data-color-option=|\$\{kind\.attr\}=)[^`]*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const html = m[1]
      // ${…} без вложенных фигурных скобок хватает: вставки здесь плоские
      .replace(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, "x")
      .trim();
    if (html.startsWith("<")) out.push(html);
  }
  return out;
}

/**
 * Поле ввода цены гидрация собирает не шаблоном, а `document.createElement`:
 * в NT-вёрстке на его месте стоит `<span>` со значением. Поэтому узел строим
 * из ИСХОДНИКА темы — имя атрибута и список классов берём оттуда, а не из
 * своей головы: перепишут гидрацию на другой элемент — извлечение упадёт.
 */
function priceInputFromSource(theme: Theme): HTMLElement {
  const src = readFileSync(
    resolve(SITES_ROOT, "packages", `theme-${theme}`, "blocks", "Catalog", "Catalog.astro"),
    "utf-8",
  );
  const at = src.indexOf('setAttribute("data-price-input"');
  if (at < 0) {
    throw new Error(`${theme}: гидрация больше не помечает поле цены data-price-input`);
  }
  const created = /document\.createElement\("(\w+)"\)/.exec(src.slice(Math.max(0, at - 900), at));
  const cls = /input\.className\s*=\s*"([^"]*)"/.exec(src.slice(at, at + 900));
  if (!created || !cls) {
    throw new Error(`${theme}: не вытащили из исходника тег/классы поля цены`);
  }
  const html = `<${created[1]} type="text" data-price-input="min" class="${cls[1]}" style="color:inherit;font:inherit">`;
  return parse(html).firstChild as HTMLElement;
}

/** Строки цены реального рендера — сюда прививается поле. */
function priceRows(theme: Theme): { label: string; el: HTMLElement }[] {
  const out: { label: string; el: HTMLElement }[] = [];
  for (const { label, panel } of panels(theme)) {
    for (const el of panel.querySelectorAll(
      ':scope [data-nt="filter-price-rows"] > div, :scope [data-nt="catalog-price"] > div',
    )) {
      out.push({ label, el });
    }
  }
  return out;
}

/** Привить шаблоны гидрации в реальную панель и вернуть их корневые узлы. */
function hydratedRows(theme: Theme): { label: string; el: HTMLElement }[] {
  const list = panels(theme);
  const host = list[0];
  if (!host) throw new Error(`${theme}: не нашли ни одной панели фильтра`);
  const out: { label: string; el: HTMLElement }[] = [];
  for (const html of hydrationRowTemplates(theme)) {
    const holder = parse(`<ul data-collections-options>${html}</ul>`)
      .firstChild as HTMLElement;
    host.panel.appendChild(holder);
    const root = holder.childNodes.find(
      (n): n is HTMLElement => (n as HTMLElement).tagName !== undefined,
    );
    if (!root) throw new Error(`${theme}: шаблон гидрации без узла — ${html.slice(0, 80)}`);
    out.push({ label: `гидрация <${root.tagName.toLowerCase()}>`, el: root });
  }
  return out;
}

// ──────────────────── мини-каскад по реальному бандлу ────────────────────
//
// Движок каскада (разбор бандла, слои, специфичность, инлайн-стиль,
// победитель) — общий: src/themes/__tests__/lib/css-cascade.ts. Его же
// используют гарды catalog-filters-mobile и catalog-layout-mobile. Своей копии
// здесь нет намеренно: вторая копия того же разбора — ровно та болезнь, от
// которой лечится этот каталог (одно правило в двух местах, которые разъедутся).
//
// Три способности этого гарда переехали в общий движок, а не остались тут:
// разбор списка селекторов с запятыми внутри `:is(…)`, специфичность `:is()` по
// самому сильному аргументу и учёт атрибута `style`.

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

type Win = { value: string; source: "inline" | "shared" | "other"; selector: string };

/**
 * Победитель каскада для свойства на конкретном узле в узком/тач-контексте.
 *
 * Считает общий движок; здесь — только ярлык источника: общий файл, чужое
 * правило или атрибут `style` узла (инлайн сильнее правила без `!important`,
 * и подмена им обязана красить проверку).
 */
function winner(theme: Theme, el: HTMLElement, prop: string): Win | null {
  const best = winnerIn(themeCss(theme), themeRules(theme), el, prop, NARROW_PX);
  if (!best) return null;
  const source: Win["source"] =
    best.selector === INLINE_SELECTOR
      ? "inline"
      : best.selector.includes('[data-nt="catalog-filters"]')
        ? "shared"
        : "other";
  return { value: best.decls[prop], source, selector: best.selector };
}

const built = (theme: Theme) =>
  existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  ) && existsSync(resolve(SITES_ROOT, "dist", "theme-css", `${theme}.css`));

/** «44px / общий=true» — один читаемый ярлык вместо трёх expect'ов. */
const tag = (win: Win | null) =>
  `${win ? win.value : "нет правила"} / общий=${win?.source === "shared"}`;

// ───────────────────────────── общий источник ─────────────────────────────

describe("строки фильтров лечатся в общем месте", () => {
  const sharedRules = parseRules(readFileSync(SHARED_CSS, "utf-8")).filter(
    (r) =>
      r.selector.includes('[data-nt="catalog-filters"] details > :not(summary)') &&
      "min-height" in r.decls,
  );

  it("в общем файле есть правило строк (не только триггера)", () => {
    expect(sharedRules.length).toBeGreaterThanOrEqual(2);
  });

  it("оно лежит в @layer utilities — иначе его перебьют утилиты Tailwind", () => {
    for (const r of sharedRules) expect(r.layer).toBe("utilities");
  });

  it("оно общее: ни один селектор не привязан к конкретной теме", () => {
    for (const r of sharedRules)
      expect(r.selector).not.toMatch(/rose|vanilla|bloom|satin|flux/i);
  });

  it.each(THEMES)("%s подключает общий файл", (theme) => {
    const entry = readFileSync(
      resolve(SITES_ROOT, "themes", theme, "src", "styles", "global.css"),
      "utf-8",
    );
    expect(entry).toContain('packages/theme-base/styles/catalog-filters.css"');
  });
});

// ─────────────── строки из статического рендера секции ───────────────

describe.each(THEMES)(
  `каталог / %s: строки панели ≥ ${MIN_TAP_PX}px`,
  (theme) => {
    it("секции темы собраны (pnpm build:theme-sections:all)", () => {
      expect(built(theme)).toBe(true);
    });

    it("строки панелей вообще найдены — «0 из 0» это дыра, а не чистота", () => {
      const rows = staticRows(theme);
      // печатаем число: пустой список обязан валить проверку, а не молчать
      expect(`${theme}: строк ${rows.length}`).toBe(
        `${theme}: строк ${rows.length}`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(5);
    });

    it(`у каждой строки min-height ≥ ${MIN_TAP_PX}px и это общий файл`, () => {
      const rows = staticRows(theme);
      expect(rows.length).toBeGreaterThan(0);
      for (const { label, el } of rows) {
        const win = winner(theme, el, "min-height");
        expect(
          `${label} <${el.tagName.toLowerCase()}>: ${tag(win)}`,
        ).toBe(`${label} <${el.tagName.toLowerCase()}>: ${MIN_TAP_PX}px / общий=true`);
      }
    });

    it("строка — флекс-контейнер: без этого центрирование не работает", () => {
      const rows = staticRows(theme);
      expect(rows.length).toBeGreaterThan(0);
      for (const { label, el } of rows) {
        const win = winner(theme, el, "display");
        expect(`${label} <${el.tagName.toLowerCase()}>: ${tag(win)}`).toBe(
          `${label} <${el.tagName.toLowerCase()}>: flex / общий=true`,
        );
      }
    });

    it("строка центрирует подпись, а не растягивает её", () => {
      const rows = staticRows(theme);
      expect(rows.length).toBeGreaterThan(0);
      for (const { label, el } of rows) {
        const win = winner(theme, el, "align-items");
        expect(`${label} <${el.tagName.toLowerCase()}>: ${tag(win)}`).toBe(
          `${label} <${el.tagName.toLowerCase()}>: center / общий=true`,
        );
      }
    });

    it("строки цены найдены и несут фиксированную высоту (h-8/h-10)", () => {
      const rows = priceRows(theme);
      expect(`${theme}: строк цены ${rows.length}`).toBe(
        `${theme}: строк цены ${rows.length}`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(2);
      // именно тут min-height обязан перебить height утилиты
      for (const { el } of rows) {
        expect(el.classNames).toMatch(/\bh-\d/);
      }
    });

    it("поле ввода цены — тоже палец, а не 20px", () => {
      const rows = priceRows(theme);
      expect(rows.length).toBeGreaterThanOrEqual(2);
      const inputs = rows.map(({ label, el }) => {
        const node = priceInputFromSource(theme);
        const holder = el.querySelector(":scope > div") ?? el;
        holder.appendChild(node);
        return { label, el: node };
      });
      for (const { label, el } of inputs) {
        const win = winner(theme, el, "min-height");
        expect(`${label} input: ${tag(win)}`).toBe(
          `${label} input: ${MIN_TAP_PX}px / общий=true`,
        );
      }
    });
  },
);

// ─────────────── строки, которые печатает гидрация в браузере ───────────────

describe.each(THEMES)(
  `каталог / %s: строки гидрации (коллекции, цвета) ≥ ${MIN_TAP_PX}px`,
  (theme) => {
    it("шаблоны строк найдены в исходнике секции", () => {
      const list = hydrationRowTemplates(theme);
      expect(`${theme}: шаблонов ${list.length}`).toBe(
        `${theme}: шаблонов ${list.length}`,
      );
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it(`корень каждого шаблона получает min-height ≥ ${MIN_TAP_PX}px из общего файла`, () => {
      const rows = hydratedRows(theme);
      expect(rows.length).toBeGreaterThanOrEqual(2);
      for (const { label, el } of rows) {
        const win = winner(theme, el, "min-height");
        expect(`${theme} ${label}: ${tag(win)}`).toBe(
          `${theme} ${label}: ${MIN_TAP_PX}px / общий=true`,
        );
      }
    });
  },
);
