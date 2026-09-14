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

type Rule = {
  selector: string;
  decls: Record<string, string>;
  layer: string;
  atRules: string[];
  order: number;
};

/**
 * Комментарии — вон до разбора.
 *
 * Иначе `/* … *\/` перед `@media` прилипает к прелюдии, блок перестаёт быть
 * at-правилом и разбирается как селектор: на исходнике общего файла (Lightning
 * CSS комментарии из бандла вырезает, а из исходника — нет) проверка слоя
 * находила ноль правил. Кавычки уважаем: в `content: "/*"` это не комментарий.
 */
function stripComments(css: string): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      const e = css.indexOf("*/", i + 2);
      i = e < 0 ? css.length : e + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const q = ch;
      let j = i + 1;
      while (j < css.length && css[j] !== q) j += css[j] === "\\" ? 2 : 1;
      out += css.slice(i, Math.min(j + 1, css.length));
      i = j + 1;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Разбор бандла в плоский список правил с их слоем и at-обёртками. */
function parseRules(cssRaw: string): Rule[] {
  const css = stripComments(cssRaw);
  const rules: Rule[] = [];
  let order = 0;

  const walk = (text: string, base: number, layer: string, ats: string[]) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      // тело блока
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      const prelude = text.slice(i, open).trim();
      const body = text.slice(open + 1, j - 1);
      if (prelude.startsWith("@layer")) {
        walk(body, base + open + 1, prelude.slice(6).trim(), ats);
      } else if (prelude.startsWith("@")) {
        walk(body, base + open + 1, layer, [...ats, prelude]);
      } else if (prelude) {
        const decls: Record<string, string> = {};
        for (const part of body.split(";")) {
          const k = part.indexOf(":");
          if (k < 0) continue;
          const prop = part.slice(0, k).trim();
          if (!prop || prop.startsWith("@") || part.includes("{")) continue;
          decls[prop] = part.slice(k + 1).trim();
        }
        for (const sel of prelude.split(","))
          rules.push({
            selector: sel.trim(),
            decls,
            layer,
            atRules: ats,
            order: order++,
          });
      }
      i = j;
    }
  };

  walk(css, 0, "UNLAYERED", []);
  return rules;
}

/**
 * Применима ли at-обёртка в контексте «узкий экран, палец».
 *
 * Неизвестное медиа-условие — не «пропустить», а упасть: молча пропущенный
 * конкурент сделал бы проверку зелёной там, где правило перебито.
 */
function atRuleApplies(at: string): boolean {
  if (at.startsWith("@supports")) return true; // современный Chromium
  if (!at.startsWith("@media")) {
    throw new Error(`неизвестная at-обёртка: ${at}`);
  }
  const query = at.slice(6).replace(/\{$/, "").trim();
  return query.split(",").some((clause) => {
    const conds = clause.match(/\([^()]*\)/g) ?? [];
    if (conds.length === 0) return false;
    return conds.every((cond) => {
      const c = cond.slice(1, -1).trim();
      let m: RegExpMatchArray | null;
      const px = (v: string) =>
        v.endsWith("rem") ? parseFloat(v) * 16 : parseFloat(v);
      if ((m = c.match(/^max-width:\s*([\d.]+(?:px|rem))$/)))
        return NARROW_PX <= px(m[1]);
      if ((m = c.match(/^min-width:\s*([\d.]+(?:px|rem))$/)))
        return NARROW_PX >= px(m[1]);
      if ((m = c.match(/^width\s*>=\s*([\d.]+(?:px|rem))$/)))
        return NARROW_PX >= px(m[1]);
      if ((m = c.match(/^width\s*<\s*([\d.]+(?:px|rem))$/)))
        return NARROW_PX < px(m[1]);
      if ((m = c.match(/^pointer:\s*(\w+)$/))) return m[1] === "coarse";
      if ((m = c.match(/^hover:\s*(\w+)$/))) return m[1] === "none";
      if (c.startsWith("prefers-reduced-motion")) return true;
      if (c.startsWith("prefers-color-scheme")) return c.includes("light");
      throw new Error(`неизвестное медиа-условие: ${c} (в ${at})`);
    });
  });
}

/** Специфичность селектора: [id, класс/атрибут/псевдокласс, элемент]. */
export function specificity(selector: string): [number, number, number] {
  // :not(X) / :is(X) сами не считаются, считается их аргумент
  const inner = selector.replace(/:(?:not|is|has)\(([^()]*)\)/g, " $1 ");
  const ids = (inner.match(/#[\w-]+/g) ?? []).length;
  const classes =
    (inner.match(/(?<!\\)\.(?:\\.|[\w-])+/g) ?? []).length +
    (inner.match(/(?<!\\)\[[^\]]*\]/g) ?? []).length +
    (inner.match(/(?<!:):(?!:)[a-z-]+/g) ?? []).length;
  const elements = (
    inner
      .replace(/(?<!\\)\[[^\]]*\]/g, " ")
      .match(/(?:^|[\s>+~])([a-z][\w-]*)/g) ?? []
  ).length;
  return [ids, classes, elements];
}

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

/**
 * Порядок слоёв бандла. Чем позже слой — тем он сильнее; unlayered сильнее
 * ЛЮБОГО слоя.
 *
 * Объявлений НЕСКОЛЬКО и считать надо все по порядку: Tailwind печатает
 * `@layer properties;`, и только следующей строкой `@layer theme, base,
 * components, utilities;`. Первая версия брала первое объявление — в списке
 * оказывался один `properties`, и `base`/`utilities` получали одинаковый ранг
 * −1. Саботаж «перенести правила в @layer base» тогда оставался ЗЕЛЁНЫМ:
 * ничья по слою отдавала победу специфичности, а в браузере выиграла бы
 * утилита `.top-full`. Имена слоёв, объявленные только блоком `@layer X {`,
 * дописываем в порядке появления — так их и упорядочивает браузер.
 */
function layerOrder(css: string): string[] {
  const order: string[] = [];
  const add = (name: string) => {
    const n = name.trim();
    if (n && !order.includes(n)) order.push(n);
  };
  const re = /@layer\s+([a-z0-9_,\s-]+)([;{])/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) m[1].split(",").forEach(add);
  return order;
}

function layerRank(css: string, layer: string): number {
  if (layer === "UNLAYERED") return Number.MAX_SAFE_INTEGER;
  const i = layerOrder(css).indexOf(layer);
  return i < 0 ? -1 : i;
}

/** Правило пришло из общего файла, а не из утилиты Tailwind. */
const fromSharedFile = (r: Rule | null) =>
  !!r && r.selector.includes('[data-nt="catalog-filters"]');

/**
 * Победитель каскада для свойства на конкретном узле в узком/тач-контексте:
 * слой → специфичность → порядок в файле. Ровно этим порядком считает браузер.
 */
function winner(theme: Theme, el: HTMLElement, prop: string) {
  const css = themeCss(theme);
  const matched = themeRules(theme).filter((r) => {
    if (!(prop in r.decls)) return false;
    if (!r.atRules.every(atRuleApplies)) return false;
    try {
      return el.matches(r.selector);
    } catch {
      return false;
    }
  });
  if (matched.length === 0) return null;
  const weight = (r: Rule): number[] => [
    layerRank(css, r.layer),
    ...specificity(r.selector),
    r.order,
  ];
  return matched.reduce((best, r) => {
    const a = weight(r);
    const b = weight(best);
    for (let i = 0; i < a.length; i++)
      if (a[i] !== b[i]) return a[i] > b[i] ? r : best;
    return best;
  });
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
