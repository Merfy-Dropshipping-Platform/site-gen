/**
 * Секции-страницы аккаунта КРАСЯТ ВСЮ ВЫСОТУ между шапкой и подвалом.
 *
 * Владелец, 14.09, две жалобы одним текстом: «Секция заказы не применяется до
 * конца цветовая схема», «Секция Личный кабинет не применяется до конца
 * цветовая схема». На скриншотах цветная область обрывается по высоте текста,
 * ниже — светлая полоса фона страницы, ещё ниже — подвал.
 *
 * ЗАМЕР «ДО» (Chromium 1280×1400, задеплоенное превью sites
 * `/api/sites/<id>/preview?page=<страница>`, 14.09, main ed3d5948; тема каждого
 * стенда определена маркерами разметки В МОМЕНТ замера, а не по названию).
 * ЩЕЛЬ = низ `<main>` − низ секции, то есть высота светлой полосы:
 *
 *   тема      page-orders  page-profile  page-wishlist  page-login
 *   rose          422          91            424           314
 *   flux          149           0            140            49
 *   vanilla       398          73            459           298
 *   bloom         339          14            325           239
 *   satin         314           0            308           214
 *
 * (Нули у flux/satin на профиле — не «там всё хорошо», а «контент выше
 * доступного места»: `<main>` там кончается ровно на секции. Стоит контенту
 * стать короче — полоса возвращается.)
 *
 * ПРИЧИНА — не в схеме: класс `color-scheme-N` на секции стоял и фон красил
 * (замер: rose page-orders фон секции rgb(171,54,159) = scheme-3). Причина в
 * том, ЧТО растянуто. `stickyFooterRule` из этого же tokens.css делает
 * `<body>` flex-колонкой ≥ вьюпорта и растягивает `<main>` (`flex:1 0 auto`),
 * но цепочка на этом обрывается: `<main>` остаётся `display:block`, а обёртка
 * схемы и сама секция сайзятся по контенту. Растянутый `<main>` под секцией
 * показывает фон страницы — это и есть «не до конца».
 *
 * ЛЕЧЕНИЕ — ровно приём чекаута (канон «схема красит КОЛОНКУ: поверхность от
 * края до края и на всю высоту, а не карточка внутри», плюс правка
 * `fix/b8-checkout-col` 9f310888): меру держит СОДЕРЖИМОЕ, а поверхность
 * забирает всё доступное место. Здесь это три звена одной цепочки —
 * `<main>` → обёртка схемы → секция. Внутренние отступы секции
 * (`.account-page-container`) не трогаются, поэтому контент не сдвигается:
 * секция растёт ТОЛЬКО вниз.
 *
 * ЗАМЕР «ПОСЛЕ» — в отчёте (тот же скрипт, tokens.css подменён на
 * пересобранный `buildTokensCss`): ЩЕЛЬ=0 во всех 20 клетках.
 *
 * Браузера в CI нет, поэтому гард стоит на том, ЧЕМ геометрия определяется:
 *   1) правило есть в единственном источнике tokens.css (live + превью);
 *   2) в нём ВСЕ ТРИ звена цепочки — иначе растяжение обрывается, как было;
 *   3) область та же, что у sticky-footer, — иначе поедет чекаут и одиночный
 *      preview/block;
 *   4) селекторы РЕАЛЬНО попадают в разметку: каждый из четырёх блоков в пяти
 *      темах рендерится скомпилированным портом и несёт `data-block` из
 *      списка правила, а `composeV2Page` кладёт его прямым ребёнком `<main>`.
 *
 * САБОТАЖ (проверено руками, числа — в отчёте): убрать любое из трёх звеньев;
 * выкинуть блок из списка поверхностей; переименовать `data-block` в порте
 * темы; снять область `body:has(footer)`. Каждый шаг обязан покраснеть здесь.
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  ACCOUNT_SURFACE_BLOCKS,
  ACCOUNT_SURFACE_CSS,
  buildTokensCss,
} from "../tokens-css";
import { composeV2Page } from "../v2-page-composer";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const THEMES = ["rose", "vanilla", "bloom", "satin", "flux"] as const;

/** Блок конструктора → маркер его корня в разметке. */
const CASES = [
  { block: "AccountSection", page: "page-profile", marker: "account-section" },
  { block: "OrdersSection", page: "page-orders", marker: "orders-section" },
  {
    block: "WishlistSection",
    page: "page-wishlist",
    marker: "wishlist-section",
  },
  { block: "LoginSection", page: "page-login", marker: "login-section" },
] as const;

/** Та же область, что у sticky-footer: он растягивает `<main>`, мы — то, что внутри. */
const SCOPE = "body:has(footer):not(:has(main main))";

const blocksReady = existsSync(
  resolve(SITES_ROOT, "dist", "astro-blocks", "manifest.json"),
);

// ── крошечный разбор CSS: селектор → объявления ────────────────────────────
// Нужен, чтобы проверять ЗВЕНО ЦЕПОЧКИ (селектор + его declarations), а не
// наличие подстроки: подстрока «flex:1 0 auto» есть и у правила sticky-footer.

interface Rule {
  selector: string;
  decls: Record<string, string>;
}

function parse(css: string): Rule[] {
  const rules: Rule[] = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const rawSel = m[1].trim();
    if (rawSel.startsWith("@")) continue;
    const decls: Record<string, string> = {};
    for (const chunk of m[2].split(";")) {
      const i = chunk.indexOf(":");
      if (i === -1) continue;
      decls[chunk.slice(0, i).trim()] = chunk.slice(i + 1).trim();
    }
    // Список селекторов через запятую резать НЕЛЬЗЯ: внутри `:has(a,b)` тоже
    // запятые. Правила цепочки пишутся по одному селектору — этого хватает.
    rules.push({ selector: rawSel, decls });
  }
  return rules;
}

/** Правило, чей селектор содержит все перечисленные куски. */
function ruleWith(rules: Rule[], ...parts: string[]): Rule | undefined {
  return rules.find((r) => parts.every((p) => r.selector.includes(p)));
}

/** `[data-block="x"],[data-block="y"]` — список поверхностей для селектора. */
const surfaceList = ACCOUNT_SURFACE_BLOCKS.map(
  (b) => `[data-block="${b}"]`,
).join(",");

// ── 1. Правило доезжает до страницы ────────────────────────────────────────

describe("поверхность аккаунта — правило в tokens.css (live + превью)", () => {
  it.each(THEMES)("%s: buildTokensCss эмитит правило", (theme) => {
    expect(buildTokensCss({}, theme)).toContain(ACCOUNT_SURFACE_CSS);
  });

  it("эмитится и без темы (манифеста может не быть)", () => {
    expect(buildTokensCss({}, null)).toContain(ACCOUNT_SURFACE_CSS);
  });

  it("не зависит от настроек мерчанта", () => {
    // Схемы/шрифты/избранное меняют куски tokens.css вокруг — правило обязано
    // ехать всегда, иначе «полоса» вернётся у части магазинов.
    const css = buildTokensCss(
      { wishlistEnabled: false, cartType: "page", sectionGap: 48 },
      "rose",
    );
    expect(css).toContain(ACCOUNT_SURFACE_CSS);
  });
});

// ── 2. Все четыре поверхности перечислены ──────────────────────────────────

describe("список поверхностей — четыре страницы аккаунта", () => {
  it("в списке ровно четыре блока и без дублей", () => {
    expect([...ACCOUNT_SURFACE_BLOCKS].sort()).toEqual([
      "account-section",
      "login-section",
      "orders-section",
      "wishlist-section",
    ]);
  });

  it.each(CASES)("$block: его маркер есть в правиле", ({ marker }) => {
    expect(ACCOUNT_SURFACE_BLOCKS).toContain(marker);
    expect(ACCOUNT_SURFACE_CSS).toContain(`[data-block="${marker}"]`);
  });
});

// ── 3. Цепочка растяжения: три звена ───────────────────────────────────────

describe("цепочка растяжения — три звена, обрыв любого возвращает полосу", () => {
  const rules = parse(ACCOUNT_SURFACE_CSS);

  it("звено 1: <main> со страницей аккаунта становится flex-колонкой", () => {
    // Без него растянут только <main> (это делает sticky-footer), а его
    // блочные дети сайзятся по контенту — ровно замер «до».
    const r = ruleWith(rules, `>main:has(${surfaceList})`);
    expect(r).toBeDefined();
    expect(r?.decls.display).toBe("flex");
    expect(r?.decls["flex-direction"]).toBe("column");
  });

  it("звено 2: обёртка схемы забирает остаток высоты и сама становится колонкой", () => {
    // composeV2Page оборачивает блок в <div class="color-scheme-N"> — это он.
    const r = ruleWith(rules, ">main>*:has(");
    expect(r).toBeDefined();
    expect(r?.decls.flex).toBe("1 0 auto");
    expect(r?.decls.display).toBe("flex");
    expect(r?.decls["flex-direction"]).toBe("column");
  });

  it("звено 3: сама секция растягивается внутри обёртки", () => {
    // Потомок <main> — чтобы работало и БЕЗ обёртки схемы (блок без colorScheme:
    // тогда секция сама прямой ребёнок <main>).
    const r = ruleWith(rules, ">main [data-block=");
    expect(r).toBeDefined();
    expect(r?.decls.flex).toBe("1 0 auto");
    // И перечислены все четыре поверхности, а не одна.
    for (const b of ACCOUNT_SURFACE_BLOCKS) {
      expect(r?.selector).toContain(`>main [data-block="${b}"]`);
    }
  });

  it("все три звена в одной области со sticky-footer", () => {
    // Шире — поедет чекаут (main main) и одиночный preview/block (без футера),
    // который обязан сайзиться по контенту.
    expect(rules.length).toBeGreaterThanOrEqual(3);
    for (const r of rules) expect(r.selector.startsWith(SCOPE)).toBe(true);
  });

  it("растягивает ТОЛЬКО страницу аккаунта, а не любой <main>", () => {
    // Каждое звено обязано быть привязано к поверхности: либо через :has(),
    // либо самим селектором поверхности. Голый `>main{display:flex}` сделал бы
    // flex-колонкой главную, каталог и товар.
    for (const r of rules) {
      const привязано =
        r.selector.includes(`:has(${surfaceList})`) ||
        r.selector.includes("[data-block=");
      expect({ selector: r.selector, привязано }).toEqual({
        selector: r.selector,
        привязано: true,
      });
    }
  });

  it("высоту задаёт flex, а не жёсткие 100vh на секции", () => {
    // 100vh на секции дал бы полосу ниже подвала и скролл на пустом месте:
    // доступное место = вьюпорт − шапка − подвал, его знает только flex.
    expect(ACCOUNT_SURFACE_CSS).not.toMatch(/100vh|100dvh|height:\s*100%/);
  });

  it("не трогает внутренние отступы секции — контент не сдвигается", () => {
    expect(ACCOUNT_SURFACE_CSS).not.toMatch(/padding|margin|gap/);
  });
});

// ── 4. Селекторы попадают в РЕАЛЬНУЮ разметку ──────────────────────────────

describe("разметка: селекторы правила действительно попадают в секции", () => {
  it("блоки скомпилированы (pnpm build:blocks)", () => {
    expect(blocksReady).toBe(true);
  });

  const rendered: Record<string, Record<string, string>> = {};

  beforeAll(() => {
    if (!blocksReady) return;
    for (const theme of THEMES) {
      const jobs = CASES.map((c) => ({
        block: c.block,
        props: { id: `${c.block}-1`, colorScheme: 3 },
        cascade: true,
      }));
      const rows = JSON.parse(
        execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
          cwd: SITES_ROOT,
          encoding: "utf-8",
          maxBuffer: 256 * 1024 * 1024,
        }),
      ) as Array<{ block?: string; html?: string; error?: string }>;
      rendered[theme] = {};
      rows.forEach((row, i) => {
        expect(row?.error).toBeUndefined();
        rendered[theme][CASES[i].block] = row?.html ?? "";
      });
    }
  }, 600_000);

  for (const theme of THEMES) {
    for (const c of CASES) {
      it(`${theme}/${c.block}: корень несёт data-block из списка правила`, () => {
        const html = rendered[theme]?.[c.block] ?? "";
        expect(html).toContain(`data-block="${c.marker}"`);
        expect(ACCOUNT_SURFACE_BLOCKS).toContain(c.marker);
      });
    }
  }

  it.each(CASES)(
    "$block: composeV2Page кладёт секцию прямым ребёнком <main> в обёртке схемы",
    (c) => {
      const html = rendered.rose?.[c.block] ?? "";
      // Подвал приходит блоком Footer — composeV2Page заменяет тело шелла
      // целиком (до последнего `</footer>`), поэтому подвал шелла тут не в счёт.
      const out = composeV2Page({
        shellHtml:
          "<!doctype html><html><head><title>t</title></head><body>" +
          '<header data-nt="h">шапка</header><main>старое</main>' +
          '<footer data-nt="old">старый подвал</footer></body></html>',
        blocksHtml: [html, '<footer data-nt="f">подвал</footer>'],
        blockTypes: [c.block, "Footer"],
        blockSchemes: ["scheme-3", null],
        assetPrefix: null,
      });
      expect(out).not.toBeNull();
      const body = out ?? "";
      // Обёртка схемы — ПРЯМОЙ ребёнок <main>: на неё смотрит звено 2.
      expect(body).toContain('<main><div class="color-scheme-3"');
      // Секция внутри обёртки: на неё смотрит звено 3.
      const открыт = body.indexOf("<main>");
      const закрыт = body.indexOf("</main>");
      const внутри = body.slice(открыт, закрыт);
      expect(внутри).toContain(`data-block="${c.marker}"`);
      // И подвал остался ПОСЛЕ </main> — иначе растягивать нечего.
      expect(body.indexOf('data-nt="f"')).toBeGreaterThan(закрыт);
    },
  );
});
