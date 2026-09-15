/**
 * Секция «Страница» ЗАБИРАЕТ ВСЮ ВЫСОТУ между шапкой и подвалом.
 *
 * Жалоба владельца 15.09 («тема flux, секция „Страница“ — отступы не
 * соблюдаются и не совпадают с настройками») распалась на два механизма:
 *
 *  1. Числа настройки — СОБЛЮДАЮТСЯ, чинить нечего. Замер живым рендером
 *     (Chromium 1280×1400, origin/main 8b18a896, композитор витрины), 5 тем ×
 *     4 значения: заданные числа приезжают ровно, без пропа работает ритм
 *     темы 120/80/64/40/120. Это сторожит `page-section-theme-padding.spec.ts`,
 *     здесь не дублируем.
 *
 *  2. Белый промежуток под секцией — БАГ. `stickyFooterRule` растягивает
 *     `<main>` (`flex:1 0 auto`), а секция сайзится по контенту: под ней
 *     видно фон страницы. Разбор, замеры «до/после» и причинность — в
 *     `../content-surface-css.ts`.
 *
 * Браузера в CI нет, поэтому сторожим то, ЧЕМ геометрия определяется:
 *   1) три звена цепочки растяжения — обрыв любого возвращает полосу;
 *   2) область та же, что у sticky-footer, — иначе поедет чекаут и одиночный
 *      `preview/block`;
 *   3) условие «последняя в <main>» — без него «Страница» толкает соседей;
 *   4) селектор РЕАЛЬНО попадает в разметку: корень блока несёт `data-block`
 *      во всех пяти темах и во всех трёх цепочках рендера;
 *   5) в реальных сидах контентных страниц «Страница» — последний блок
 *      `<main>`, то есть условие (3) на них срабатывает.
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CONTENT_SURFACE_BLOCKS,
  CONTENT_SURFACE_CSS,
} from "../content-surface-css";
import { composeV2Page } from "../v2-page-composer";
import { buildTokensCss } from "../tokens-css";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;
type Theme = (typeof THEMES)[number];

/** Та же область, что у sticky-footer (tokens-css.ts): он тянет <main>, мы — то, что внутри. */
const SCOPE = 'body:has(footer):not(:has(main main))';
/** Маркер корня секции «Страница». */
const MARKER = 'page';

const blocksReady = existsSync(
  resolve(SITES_ROOT, "dist", "astro-blocks", "manifest.json"),
);

// ── разбор CSS: селектор → объявления ──────────────────────────────────────
interface Rule {
  selector: string;
  decls: Record<string, string>;
}
function parse(css: string): Rule[] {
  const rules: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const decls: Record<string, string> = {};
    for (const chunk of m[2].split(";")) {
      const i = chunk.indexOf(":");
      if (i === -1) continue;
      decls[chunk.slice(0, i).trim()] = chunk.slice(i + 1).trim();
    }
    rules.push({ selector: m[1].trim(), decls });
  }
  return rules;
}
const ruleWith = (rules: Rule[], ...parts: string[]) =>
  rules.find((r) => parts.every((p) => r.selector.includes(p)));

const RULES = parse(CONTENT_SURFACE_CSS);

// ── 0. Проводка: правило доезжает до страницы ──────────────────────────────
// Без этого блока правило можно тихо потерять при следующем слиянии
// tokens-css.ts — оно останется в своём файле, но перестанет попадать в
// tokens.css, и полоса вернётся молча, при зелёных остальных проверках.

describe("проводка — правило в tokens.css (live + превью, единый источник)", () => {
  it.each(THEMES)("%s: buildTokensCss эмитит правило", (theme) => {
    expect(buildTokensCss({}, theme)).toContain(CONTENT_SURFACE_CSS);
  });

  it("эмитится и без темы (манифеста может не быть)", () => {
    expect(buildTokensCss({}, null)).toContain(CONTENT_SURFACE_CSS);
  });

  it("не зависит от настроек мерчанта", () => {
    // Схемы/шрифты/избранное/section-gap меняют куски tokens.css вокруг —
    // правило обязано ехать всегда, иначе полоса вернётся у части магазинов.
    expect(
      buildTokensCss(
        { wishlistEnabled: false, cartType: "page", sectionGap: 48 },
        "flux",
      ),
    ).toContain(CONTENT_SURFACE_CSS);
  });
});

// ── 1. Цепочка растяжения: три звена ───────────────────────────────────────

describe("цепочка растяжения — три звена, обрыв любого возвращает полосу", () => {
  it("звено 1: <main> контентной страницы становится flex-колонкой", () => {
    // Без него растянут только <main> (это делает sticky-footer), а его
    // блочные дети сайзятся по контенту — ровно замер «до» (414…834px).
    const r = ruleWith(RULES, ">main:has(");
    expect(r).toBeDefined();
    expect(r?.decls.display).toBe("flex");
    expect(r?.decls["flex-direction"]).toBe("column");
  });

  it("звено 2: обёртка схемы забирает остаток высоты и сама становится колонкой", () => {
    // composeV2Page оборачивает блок в <div class="color-scheme-N"> — это он.
    const r = ruleWith(RULES, ">main>*:last-child:has(");
    expect(r).toBeDefined();
    expect(r?.decls.flex).toBe("1 0 auto");
    expect(r?.decls.display).toBe("flex");
    expect(r?.decls["flex-direction"]).toBe("column");
  });

  it("звено 3: сама секция растягивается — и в обёртке схемы, и без неё", () => {
    const r = ruleWith(RULES, `>main>*:last-child[data-block="${MARKER}"]`);
    expect(r).toBeDefined();
    expect(r?.decls.flex).toBe("1 0 auto");
    // Второй вариант селектора — секция ВНУТРИ обёртки схемы. Без него блок
    // с colorScheme (а он стоит в каждом сиде) не растянулся бы.
    expect(r?.selector).toContain(`>main>*:last-child [data-block="${MARKER}"]`);
  });

  it("звеньев ровно три и все в одной области со sticky-footer", () => {
    // Шире — поедет чекаут (main main) и одиночный preview/block (без подвала),
    // который обязан сайзиться по контенту.
    expect(RULES).toHaveLength(3);
    for (const r of RULES) {
      for (const sel of r.selector.split(/,(?![^(]*\))/)) {
        expect(sel.trim().startsWith(SCOPE)).toBe(true);
      }
    }
  });
});

// ── 2. Условие «последняя в <main>» — иначе двигаются соседи ───────────────

describe("растягиваем ТОЛЬКО последнюю секцию <main>", () => {
  it("каждое звено требует :last-child", () => {
    // Замер варианта БЕЗ этого условия (flux, «Страница + Галерея»):
    // верх галереи 326 → 622, то есть «Страница» толкала соседа вниз.
    for (const r of RULES) expect(r.selector).toContain(":last-child");
  });

  it("каждое звено привязано к маркеру секции, а не к любому <main>", () => {
    // Голый `>main{display:flex}` сделал бы flex-колонкой главную и каталог.
    for (const r of RULES) {
      expect(r.selector).toContain(`[data-block="${MARKER}"]`);
    }
  });

  it("нет вложенного :has() — иначе браузер выбрасывает правило целиком", () => {
    // Проверено замером: вариант с `:has(…:has(…))` не сработал ни в одной из
    // 25 клеток — селектор невалиден, правило отбрасывается молча.
    for (const r of RULES) {
      const inner = /:has\(([^()]*(?:\([^()]*\))?[^()]*)\)/g;
      let m: RegExpExecArray | null;
      while ((m = inner.exec(r.selector))) {
        expect(m[1]).not.toContain(":has(");
      }
    }
  });
});

// ── 3. Чего правило НЕ делает ──────────────────────────────────────────────

describe("правило не подменяет собой отступы и не задаёт высоту числом", () => {
  it("высоту задаёт flex, а не жёсткие 100vh", () => {
    // 100vh дал бы полосу НИЖЕ подвала и скролл на пустом месте: доступное
    // место = вьюпорт − шапка − подвал, его знает только flex.
    expect(CONTENT_SURFACE_CSS).not.toMatch(/100vh|100dvh|height:\s*100%/);
  });

  it("не трогает padding/margin/gap — отступы остаются настройкой мерчанта", () => {
    // Иначе это была бы вторая правда про отступ рядом с пропом и токеном темы.
    expect(CONTENT_SURFACE_CSS).not.toMatch(/padding|margin|gap/);
  });

  it("в списке поверхностей ровно «Страница» и без дублей", () => {
    expect([...CONTENT_SURFACE_BLOCKS]).toEqual([MARKER]);
  });
});

// ── 4. Селектор попадает в РЕАЛЬНУЮ разметку ───────────────────────────────

describe("разметка: корень «Страницы» несёт маркер во всех темах и цепочках", () => {
  it("блоки скомпилированы (pnpm build:blocks)", () => {
    expect(blocksReady).toBe(true);
  });

  const props = {
    id: "Page-about",
    siteId: "t",
    colorScheme: "scheme-1",
    headingSize: "large",
    heading: "О нас",
    content: "<p>Текст.</p>",
    padding: { top: 56, bottom: 0 },
  };

  /** Три цепочки нормализации, которыми ходят витрина, превью и hot-render. */
  const CHAINS = [
    { name: "live (витрина + hot-render)", job: { live: true } },
    { name: "pipeline (preview.service)", job: { pipeline: true } },
    { name: "cascade (без нормализации)", job: {} },
  ] as const;

  const render = (theme: Theme, extra: Record<string, unknown>): string => {
    const jobs = [{ block: "Page", props, cascade: true, ...extra }];
    const rows = JSON.parse(
      execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
        cwd: SITES_ROOT,
        encoding: "utf-8",
        maxBuffer: 64 * 1024 * 1024,
      }),
    ) as { html?: string }[];
    const html = rows[0]?.html;
    if (html === undefined) {
      throw new Error(`рендер «Страница» (${theme}) не дал HTML`);
    }
    return html;
  };

  /** Открывающий тег КОРНЯ секции — узла с data-puck-component-id блока. */
  const rootTag = (html: string): string => {
    const tag = /<section[^>]*data-puck-component-id="Page-about"[^>]*>/i.exec(
      html,
    )?.[0];
    if (!tag) throw new Error(`корень секции не найден: ${html.slice(0, 200)}`);
    return tag;
  };

  for (const theme of THEMES) {
    for (const chain of CHAINS) {
      it(`${theme} / ${chain.name}: маркер стоит на КОРНЕ секции`, () => {
        if (!blocksReady) throw new Error("нет сборки блоков");
        const tag = rootTag(render(theme, chain.job));
        expect(tag).toContain(`data-block="${MARKER}"`);
      });
    }
  }

  it("маркер геометрически инертен: отступы секции не изменились", () => {
    // Маркер — только адрес для правила. Замер подтвердил: с ним и без него
    // числа совпали до пикселя (rose 401/641/561/585/361).
    if (!blocksReady) throw new Error("нет сборки блоков");
    const tag = rootTag(render("flux", { live: true }));
    expect(tag).toContain("padding-top:56px");
    expect(tag).toContain("padding-bottom:0px");
    expect(tag).toMatch(/\bpy-\[var\(--section-padding[,)]/);
  });
});

// ── 5. На реальных сидах условие :last-child срабатывает ───────────────────

describe("сиды контентных страниц: «Страница» — последний блок <main>", () => {
  /** Блоки, которые composeV2Page уносит из <main> в хром. */
  const CHROME = new Set(["PromoBanner", "Header", "Footer"]);

  const seeds = THEMES.flatMap((theme) =>
    ["about", "delivery"].map((page) => ({ theme, page })),
  ).filter(({ theme, page }) =>
    existsSync(
      resolve(SITES_ROOT, "packages", `theme-${theme}`, "pages", `${page}.json`),
    ),
  );

  it("сиды вообще нашлись", () => {
    expect(seeds.length).toBeGreaterThanOrEqual(5);
  });

  it.each(seeds)("$theme/$page", ({ theme, page }) => {
    const seed = JSON.parse(
      readFileSync(
        resolve(SITES_ROOT, "packages", `theme-${theme}`, "pages", `${page}.json`),
        "utf-8",
      ),
    ) as { content: { type: string }[] };
    const body = seed.content.map((b) => b.type).filter((t) => !CHROME.has(t));
    // Страница без «Страницы» — не наш случай (bloom/about собран из
    // MainText+ImageWithText). Где блок есть, он обязан быть последним.
    if (!body.includes("Page")) return;
    expect(body[body.length - 1]).toBe("Page");
  });

  it("composeV2Page кладёт секцию последним ребёнком <main> в обёртке схемы", () => {
    if (!blocksReady) throw new Error("нет сборки блоков");
    const rows = JSON.parse(
      execFileSync(
        "node",
        [
          RENDERER,
          "flux",
          JSON.stringify([
            { block: "Page", props: { id: "Page-about", siteId: "t" }, cascade: true, live: true },
          ]),
        ],
        { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
      ),
    ) as { html?: string }[];
    const out = composeV2Page({
      shellHtml:
        "<!doctype html><html><head><title>t</title></head><body>" +
        '<header data-nt="h">шапка</header><main>старое</main>' +
        '<footer data-nt="old">старый подвал</footer></body></html>',
      blocksHtml: [rows[0]?.html ?? "", '<footer data-nt="f">подвал</footer>'],
      blockTypes: ["Page", "Footer"],
      blockSchemes: ["scheme-1", null],
      assetPrefix: null,
    });
    const main = /<main>([\s\S]*?)<\/main>/.exec(out ?? "")?.[1] ?? "";
    // Обёртка схемы — единственный ребёнок <main>, секция внутри неё.
    expect(main).toContain('<div class="color-scheme-1"');
    expect(main).toContain(`data-block="${MARKER}"`);
    expect(main.trimEnd().endsWith("</div>")).toBe(true);
  });
});
