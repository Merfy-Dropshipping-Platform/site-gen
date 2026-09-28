import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

import { applyFooterData } from "../footer-data";
import {
  TEMPLATE_SITE_TITLES,
  applyHeaderShopName,
  applyHeaderSiteTitles,
  headerSiteTitle,
  isTemplateSiteTitle,
} from "../header-title";

/**
 * Владелец 28.09: «крч везде вместо логотипа брать название сайта».
 * Шапка без загруженного логотипа пишет siteTitle — а там у большинства
 * магазинов стартовое название темы из сида («Rose» у 124, «Vanilla Pilot» у
 * 25, «Satin» у 18, «Flux» у 15 на 28.09). Правило: своё название мерчанта в
 * шапке остаётся, стартовое/пустое заменяется названием сайта из админки.
 */

const ROOT = resolve(__dirname, "..", "..", "..");

describe("headerSiteTitle — какое название ставить в шапку", () => {
  it.each([
    ["Flux", "Магазин Ромашка", "Магазин Ромашка"],
    ["ROSE", "Магазин Ромашка", "Магазин Ромашка"],
    ["  Vanilla Pilot ", "Магазин Ромашка", "Магазин Ромашка"],
    ["Мой магазин", "Магазин Ромашка", "Магазин Ромашка"],
    ["", "Магазин Ромашка", "Магазин Ромашка"],
    [undefined, "Магазин Ромашка", "Магазин Ромашка"],
    ["Лавка Пети", "Магазин Ромашка", undefined],
    ["Flux", "", undefined],
    ["Flux", null, undefined],
  ])("шапка %p, сайт %p → %p", (current, siteName, expected) => {
    expect(headerSiteTitle(current, siteName)).toBe(expected);
  });
});

/** Все строковые siteTitle из JSON-файла (сиды страниц, theme.json, шаблоны). */
function siteTitlesIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(siteTitlesIn);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([k, v]) =>
    k === "siteTitle" && typeof v === "string" ? [v] : siteTitlesIn(v),
  );
}

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => join(dir, f));
}

function seedTitles(): Array<[string, string]> {
  const pkgs = readdirSync(join(ROOT, "packages")).filter((d) => d.startsWith("theme-"));
  const files = [
    ...pkgs.map((d) => join(ROOT, "packages", d, "theme.json")).filter(existsSync),
    ...pkgs.flatMap((d) => jsonFiles(join(ROOT, "packages", d, "pages"))),
    ...jsonFiles(join(ROOT, "src", "generator", "templates", "defaults")),
  ];
  const fromJson = files.flatMap((f) =>
    siteTitlesIn(JSON.parse(readFileSync(f, "utf8"))).map((t) => [f.slice(ROOT.length + 1), t] as [string, string]),
  );
  const consts = readdirSync(join(ROOT, "themes"))
    .map((t) => join(ROOT, "themes", t, "src", "consts.ts"))
    .filter(existsSync)
    .flatMap((f) => {
      const m = readFileSync(f, "utf8").match(/SITE_TITLE = ['"]([^'"]+)['"]/);
      return m ? [[f.slice(ROOT.length + 1), m[1]] as [string, string]] : [];
    });
  const puck = readFileSync(join(ROOT, "packages/theme-base/blocks/Header/Header.puckConfig.ts"), "utf8");
  const astro = readFileSync(join(ROOT, "packages/theme-base/blocks/Header/Header.astro"), "utf8");
  const base: Array<[string, string]> = [
    ["Header.puckConfig defaultProps", puck.match(/siteTitle: '([^']+)'/)![1]],
    ["Header.astro параметр по умолчанию", astro.match(/siteTitle = '([^']+)'/)![1]],
  ];
  return [...fromJson, ...consts, ...base];
}

describe("список стартовых названий покрывает все сиды", () => {
  const titles = seedTitles();

  it("сиды найдены", () => {
    expect(titles.length).toBeGreaterThan(50);
  });

  it("каждое название из сидов/портов/общей шапки — стартовое", () => {
    const missing = titles.filter(([, t]) => !isTemplateSiteTitle(t));
    expect(missing).toEqual([]);
  });

  it("в списке нет дублей", () => {
    const keys = TEMPLATE_SITE_TITLES.map((t) => t.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("applyHeaderSiteTitles — все шапки ревизии", () => {
  it("меняет стартовые названия на всех страницах и в legacy content, своё не трогает", () => {
    const rev = {
      pagesData: {
        home: { content: [{ type: "Header", props: { siteTitle: "Rose" } }, { type: "Footer", props: { siteTitle: "Rose" } }] },
        catalog: { content: [{ type: "Header", props: {} }] },
        about: { content: [{ type: "Header", props: { siteTitle: "Лавка Пети" } }] },
      },
      content: [{ type: "Header", props: { siteTitle: "SATIN" } }],
    };
    expect(applyHeaderSiteTitles(rev, "Магазин Ромашка")).toBe(3);
    expect(rev.pagesData.home.content[0].props.siteTitle).toBe("Магазин Ромашка");
    // подвал — забота applyFooterData, здесь не трогается
    expect(rev.pagesData.home.content[1].props.siteTitle).toBe("Rose");
    expect((rev.pagesData.catalog.content[0].props as { siteTitle?: string }).siteTitle).toBe("Магазин Ромашка");
    expect(rev.pagesData.about.content[0].props.siteTitle).toBe("Лавка Пети");
    expect(rev.content[0].props.siteTitle).toBe("Магазин Ромашка");
  });
});

/** Поддельная база: таблица по ссылке на объект схемы (как footer-data-signature.spec). */
type Row = Record<string, unknown>;
function fakeDb(rowsByTable: Map<unknown, Row[]>) {
  return {
    select() {
      return {
        from(table: unknown) {
          const rows = rowsByTable.get(table) ?? [];
          return { where: () => Promise.resolve(rows) };
        },
      };
    },
  } as never;
}
const site = { id: "site", name: "name", settings: "settings" };
const sitePolicy = { siteId: "siteId" };
const siteContacts = { siteId: "siteId" };
const schema = { site, sitePolicy, siteContacts } as never;
const db = fakeDb(
  new Map<unknown, Row[]>([
    [site, [{ name: "Магазин Ромашка", settings: null }]],
    [sitePolicy, []],
    [siteContacts, []],
  ]),
);

describe("оба пути рендера доводят название до шапки", () => {
  it("applyFooterData (сборка витрины и страница превью) подставляет его в шапку", async () => {
    const rev = { pagesData: { home: { content: [{ type: "Header", props: { siteTitle: "Flux", logo: "" } }] } } };
    await applyFooterData({ db, schema }, "site-1", rev);
    expect(rev.pagesData.home.content[0].props.siteTitle).toBe("Магазин Ромашка");
  });

  it("точечная перерисовка шапки в превью — applyHeaderShopName", async () => {
    const rev = { content: [{ type: "Header", props: { siteTitle: "Vanilla Pilot" } }] };
    await applyHeaderShopName({ db, schema }, "site-1", rev);
    expect(rev.content[0].props.siteTitle).toBe("Магазин Ромашка");
  });

  it("preview.controller зовёт applyHeaderShopName для блока Header", () => {
    const src = readFileSync(join(ROOT, "src/controllers/preview.controller.ts"), "utf8");
    expect(src).toMatch(/if \(body\.blockType === 'Header'\) \{\s*await applyHeaderShopName\(/);
  });
});
