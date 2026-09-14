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
 * ИНЛАЙН-СТИЛИ. `winner()` учитывает атрибут `style` узла: инлайн сильнее любого
 * правила без `!important`. Без этого подмена `style="min-height:0"` оставила бы
 * проверку зелёной (дыра, найденная на соседнем гарде).
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
  const re = /`([^`]*(?:data-collection-option=|data-color-option=)[^`]*)`/g;
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

type Rule = {
  selector: string;
  decls: Record<string, string>;
  layer: string;
  atRules: string[];
  order: number;
};

/** Комментарии — вон до разбора (кавычки уважаем). */
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

  const walk = (text: string, layer: string, ats: string[]) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
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
        walk(body, prelude.slice(6).trim(), ats);
      } else if (prelude.startsWith("@")) {
        walk(body, layer, [...ats, prelude]);
      } else if (prelude) {
        const decls: Record<string, string> = {};
        for (const part of body.split(";")) {
          const k = part.indexOf(":");
          if (k < 0) continue;
          const prop = part.slice(0, k).trim();
          if (!prop || prop.startsWith("@") || part.includes("{")) continue;
          decls[prop] = part.slice(k + 1).trim();
        }
        // запятые внутри :is(…)/:not(…) — не разделители списка селекторов
        for (const sel of splitSelectorList(prelude))
          rules.push({ selector: sel, decls, layer, atRules: ats, order: order++ });
      }
      i = j;
    }
  };

  walk(css, "UNLAYERED", []);
  return rules;
}

/**
 * Разбить список селекторов по запятым ВЕРХНЕГО уровня.
 *
 * Наивный `split(",")` рвал бы `:is(p, li, …)` на куски вроде `li` — и правило
 * получило бы специфичность (0,0,1) и селектор, который матчит пол-документа.
 */
export function splitSelectorList(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of prelude) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Применима ли at-обёртка в контексте «узкий экран, палец». */
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
  // у :is()/:not()/:has() считается САМЫЙ СИЛЬНЫЙ аргумент, сам псевдокласс — нет
  const inner = selector.replace(/:(?:not|is|has)\(([^()]*)\)/g, (_all, arg: string) => {
    const best = splitSelectorList(arg)
      .map((s) => specificity(s))
      .sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])[0] ?? [0, 0, 0];
    return ` ${"#i".repeat(best[0])}${".c".repeat(best[1])}${" e".repeat(best[2])} `;
  });
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

/** Порядок слоёв бандла: чем позже — тем сильнее; unlayered сильнее любого. */
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

/** Объявление из атрибута style: сильнее любого правила без !important. */
function inlineDecl(style: string, prop: string): string | null {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i").exec(style);
  return m ? m[1].trim() : null;
}

type Win = { value: string; source: "inline" | "shared" | "other"; selector: string };

/**
 * Победитель каскада для свойства на конкретном узле в узком/тач-контексте:
 * инлайн → слой → специфичность → порядок в файле.
 */
function winner(theme: Theme, el: HTMLElement, prop: string): Win | null {
  const inline = inlineDecl(el.getAttribute("style") ?? "", prop);
  if (inline != null) return { value: inline, source: "inline", selector: "style=" };

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
  const best = matched.reduce((acc, r) => {
    const a = weight(r);
    const b = weight(acc);
    for (let i = 0; i < a.length; i++)
      if (a[i] !== b[i]) return a[i] > b[i] ? r : acc;
    return acc;
  });
  return {
    value: best.decls[prop],
    source: best.selector.includes('[data-nt="catalog-filters"]')
      ? "shared"
      : "other",
    selector: best.selector,
  };
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
