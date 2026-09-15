/**
 * Каталог на узком экране не бывает пустым; правило раскладок живёт в ОДНОМ месте.
 *
 * БАГ (2026-09-14, найден при проверке фильтров; тема flux, 375px, /catalog):
 * шапка → обрезанный баннер «Каталог» → сразу рассылка и подвал. Ни фильтров,
 * ни товаров.
 *
 * ПРИЧИНА. Правило взаимного скрытия раскладок жило в ДВУХ слоях, и они
 * разъехались:
 *
 *   packages/theme-<t>/blocks/Catalog/Catalog.astro   5 форков × 3 правила
 *       @media (min-width: 1024px) — скрыть неактивный вариант
 *       @media (max-width: 1023px) — скрыть side ВСЕГДА (мобильная ветка)
 *
 *   порты тем                                         5 форков × 2 правила
 *       themes/rose|satin|flux/src/pages/catalog.astro
 *       themes/bloom/src/components/catalog/BloomCategoryPage.astro
 *       themes/vanilla/src/components/catalog/VanillaCatalogSection.astro
 *       те же два правила, но БЕЗ @media — доmobile-версия.
 *
 * На живой /catalog встречались обе копии: тело страницы собирает
 * composeContentPagesIntoDist (page-catalog, requireOwnShell) из БЛОКА, а <head>
 * остаётся от порта-шелла, и его `is:global` стили никуда не деваются. При
 * раскладке side на узком экране порт прятал top, блок прятал side — не
 * оставалось ничего.
 *
 * ЗАМЕР «ДО» (Chromium, 375px, раскладка side; харнесс откалиброван по живым
 * стендам — число сработавших правил сошлось 5/5 из 5 тем):
 *
 *   тема      правил   плиток   <main>        после починки
 *   rose         2        0      154px   →    1 / 8 / 1602px
 *   satin        2        0      175px   →    1 / 8 / 1509px
 *   flux         2        0      181px   →    1 / 8 / 1375px
 *   vanilla      1       12     5346px   →    без изменений (его копия scoped)
 *   bloom        1       12     5649px   →    без изменений (копия не на /catalog)
 *
 * Живой стенд flux: 2 сработавших правила, 0 плиток, <main> 221px против
 * 1590px на 1280px. Контроль 1280px: 0 изменившихся клеток из 10.
 *
 * ЧТО СТОРОЖИМ. Две вещи, и обе обязательны:
 *
 *   1) ЕДИНСТВЕННОСТЬ. Копия правила не должна появиться больше НИГДЕ. Это
 *      единственное, что не даёт болезни вернуться: разъехаться могут только
 *      две копии.
 *   2) ПОБЕДИТЕЛЯ КАСКАДА в РЕАЛЬНОМ бандле темы (dist/theme-css/<t>.css) для
 *      РЕАЛЬНЫХ узлов рендера секции (dist/theme-sections/<t>). Проверка «есть
 *      правило в файле» слепа: правило может быть и быть перебитым утилитой
 *      Tailwind (`.flex` у обеих обёрток вариантов лежит в @layer utilities).
 *
 * Требует сборки (тот же порядок, что в CI):
 *   pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parse, type HTMLElement } from "node-html-parser";

import { parseRules, stripComments, winnerIn } from "./lib/css-cascade";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SHARED_CSS = resolve(
  SITES_ROOT,
  "packages",
  "theme-base",
  "styles",
  "catalog-layout.css",
);

const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;
type Theme = (typeof THEMES)[number];

/** Узкий экран замера и контрольный десктоп. Константы, не innerWidth. */
const NARROW_PX = 375;
const WIDE_PX = 1280;
/** Порог десктопной раскладки. Тот же `lg`, что у Tailwind. */
const DESKTOP_BP = 1024;

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
        id: "Catalog-layout-guard",
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

/**
 * Корень секции и обе обёртки вариантов при заданной раскладке.
 *
 * Раскладку ставим тем же атрибутом, что инлайн-скрипт секции из
 * `window.__MERFY_CATALOG_LAYOUT__` (его инжектит build.service по
 * Catalog.filterPosition из конструктора).
 */
function variants(theme: Theme, layout: "top" | "side") {
  const root = parse(renderCatalog(theme)).querySelector(
    "[data-catalog-layout]",
  );
  if (!root) throw new Error(`${theme}: нет узла [data-catalog-layout]`);
  root.setAttribute("data-catalog-layout", layout);
  const pick = (v: "top" | "side"): HTMLElement => {
    const list = root
      .querySelectorAll(`[data-catalog-variant="${v}"]`)
      // вложенные узлы вариантов бывают у разметки фильтров — берём обёртку
      .filter((el) => el.closest('[data-catalog-variant]') === el);
    if (list.length !== 1) {
      throw new Error(
        `${theme}: ожидали одну обёртку [data-catalog-variant="${v}"], нашли ${list.length}`,
      );
    }
    return list[0];
  };
  return { top: pick("top"), side: pick("side") };
}

// ───────────────── каскад в реальном бандле темы ─────────────────

const cssCache = new Map<Theme, string>();
const rulesCache = new Map<Theme, ReturnType<typeof parseRules>>();

/** Реальный бандл темы: ровно его грузит витрина и превью (loadThemeCss). */
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

function themeRules(theme: Theme) {
  const ready = rulesCache.get(theme);
  if (ready) return ready;
  const rules = parseRules(themeCss(theme));
  rulesCache.set(theme, rules);
  return rules;
}

/** `display` победителя каскада на узле при данной ширине окна. */
function displayAt(theme: Theme, el: HTMLElement, width: number): string {
  const win = winnerIn(themeCss(theme), themeRules(theme), el, "display", width);
  return win ? win.decls.display : "(нет правила)";
}

const built = (theme: Theme) =>
  existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  ) && existsSync(resolve(SITES_ROOT, "dist", "theme-css", `${theme}.css`));

// ───────────────── единственность источника правды ─────────────────

/** Правило переключения раскладок: скрытие варианта по data-catalog-layout. */
const SWITCH_RE =
  /\[data-catalog-layout[^\]]*\]\s*\[data-catalog-variant\s*=\s*["']?(?:top|side)["']?\]/;

/** Все .astro-исходники тем и блоков — там и жили обе разъехавшиеся копии. */
function astroSources(): string[] {
  const roots = [resolve(SITES_ROOT, "packages"), resolve(SITES_ROOT, "themes")];
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === "node_modules" || name === "dist" || name === ".astro") continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".astro")) out.push(p);
    }
  };
  roots.forEach(walk);
  return out;
}

/** Содержимое всех <style> файла без комментариев (в них правило не работает). */
function styleText(file: string): string {
  const src = readFileSync(file, "utf-8");
  let out = "";
  const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out += stripComments(m[1]) + "\n";
  return out;
}

describe("правило раскладок каталога — один источник правды", () => {
  it("общий файл существует", () => {
    expect(existsSync(SHARED_CSS)).toBe(true);
  });

  it.each(THEMES)("%s подключает общий файл", (theme) => {
    const entry = readFileSync(
      resolve(SITES_ROOT, "themes", theme, "src", "styles", "global.css"),
      "utf-8",
    );
    expect(entry).toContain('packages/theme-base/styles/catalog-layout.css"');
  });

  it("правила общего файла лежат в @layer utilities (иначе их перебьют утилиты)", () => {
    const rules = parseRules(readFileSync(SHARED_CSS, "utf-8")).filter((r) =>
      SWITCH_RE.test(r.selector),
    );
    expect(rules.length).toBe(3);
    for (const r of rules) expect(r.layer).toBe("utilities");
  });

  it("десктопная ветка — ровно два правила под min-width: 1024px", () => {
    const desktop = parseRules(readFileSync(SHARED_CSS, "utf-8"))
      .filter((r) => SWITCH_RE.test(r.selector))
      .filter((r) => r.atRules.some((a) => a.includes(`min-width: ${DESKTOP_BP}px`)));
    expect(desktop.map((r) => r.selector).sort()).toEqual([
      '[data-catalog-layout="side"] [data-catalog-variant="top"]',
      '[data-catalog-layout="top"] [data-catalog-variant="side"]',
    ]);
  });

  it("мобильная ветка есть и прячет ТОЛЬКО side", () => {
    const mobile = parseRules(readFileSync(SHARED_CSS, "utf-8"))
      .filter((r) => SWITCH_RE.test(r.selector))
      .filter((r) => r.atRules.some((a) => /max-width:\s*1023/.test(a)));
    // ровно одно правило, и оно про side: правило про top здесь и делало
    // каталог пустым — на <lg оба варианта оказывались скрыты
    expect(mobile.map((r) => r.selector)).toEqual([
      '[data-catalog-layout] [data-catalog-variant="side"]',
    ]);
  });

  it("копии правила нет НИ В ОДНОМ .astro (ни в блоках, ни в портах тем)", () => {
    const guilty = astroSources()
      .filter((f) => SWITCH_RE.test(styleText(f)))
      .map((f) => relative(SITES_ROOT, f))
      .sort();
    expect(guilty).toEqual([]);
  });
});

// ──────────── поведение: на узком экране каталог не пустой ────────────

describe.each(THEMES)("каталог / %s", (theme) => {
  it("секции темы собраны (pnpm build:theme-sections:all)", () => {
    expect(built(theme)).toBe(true);
  });

  it.each(["top", "side"] as const)(
    `раскладка %s на ${NARROW_PX}px: виден top-вариант, side скрыт`,
    (layout) => {
      const v = variants(theme, layout);
      // сердце бага: при side ТОЖЕ должен остаться top — сайдбар на узком
      // экране lg-only, других фильтров там нет
      expect(`top=${displayAt(theme, v.top, NARROW_PX)}`).not.toBe("top=none");
      expect(`side=${displayAt(theme, v.side, NARROW_PX)}`).toBe("side=none");
    },
  );

  it(`раскладка top на ${WIDE_PX}px: виден top, скрыт side`, () => {
    const v = variants(theme, "top");
    expect(`top=${displayAt(theme, v.top, WIDE_PX)}`).not.toBe("top=none");
    expect(`side=${displayAt(theme, v.side, WIDE_PX)}`).toBe("side=none");
  });

  it(`раскладка side на ${WIDE_PX}px: виден side, скрыт top`, () => {
    const v = variants(theme, "side");
    expect(`side=${displayAt(theme, v.side, WIDE_PX)}`).not.toBe("side=none");
    expect(`top=${displayAt(theme, v.top, WIDE_PX)}`).toBe("top=none");
  });
});
