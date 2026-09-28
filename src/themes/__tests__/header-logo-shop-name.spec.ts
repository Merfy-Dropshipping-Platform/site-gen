import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { applyHeaderSiteTitles } from "../../utils/header-title";

/**
 * Владелец 28.09: «крч везде вместо логотипа брать название сайта».
 *
 * Пять тем, шапка от ревизии до разметки: ревизия с шапкой из сида
 * (`siteTitle` = стартовое название темы, логотипа нет) → общая подстановка
 * `applyHeaderSiteTitles` (её зовут сборка витрины и превью через
 * applyFooterData) → рендер скомпилированного порта темы
 * (dist/theme-sections/<тема> — тот же модуль у витрины и превью).
 *
 * Замер до правки (28.09): шапки печатали «ROSE»/«SATIN»/«BLOOM» текстом, flux
 * и vanilla — вордмарк темы картинкой (logo-flux.svg, Vanila-designers.svg),
 * при любом названии магазина.
 */
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SHOP = "Магазин Ромашка";
const OWN = "Лавка Пети";
const UPLOAD = "https://minio.merfy.ru/branding/t1/s1/logo-1.png";

// Стартовое название каждой темы — ровно то, что лежит в её сидах.
const THEMES: Array<[string, string]> = [
  ["rose", "Rose"],
  ["bloom", "Bloom"],
  ["satin", "Satin"],
  ["flux", "Flux"],
  ["vanilla", "Vanilla Pilot"],
];

function renderHeader(theme: string, props: Record<string, unknown>): string {
  const full = {
    id: "Header-1",
    colorScheme: "1",
    navigationLinks: [{ label: "Каталог", href: "/catalog" }],
    ...props,
  };
  const out = execFileSync("node", [RENDERER, theme, JSON.stringify([{ block: "Header", props: full }])], {
    cwd: SITES_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const [res] = JSON.parse(out) as Array<{ html?: string; error?: string }>;
  if (res.error) throw new Error(`${theme}: ${res.error}`);
  return res.html ?? "";
}

/** Шапка после общей подстановки названия: как на витрине и в превью. */
function headerFromRevision(theme: string, headerProps: Record<string, unknown>): string {
  const rev = { pagesData: { home: { content: [{ type: "Header", props: { ...headerProps } }] } } };
  applyHeaderSiteTitles(rev, SHOP);
  return renderHeader(theme, rev.pagesData.home.content[0].props);
}

/** Ссылки на главную = места логотипа (мобильный ряд + десктоп). */
const homeLinks = (html: string) => html.match(/<a href="\/"[^>]*>[\s\S]*?<\/a>/g) ?? [];

/** Классы всех элементов, в которых напечатано название (мобильный + десктоп). */
function textClasses(html: string, text: string): string[] {
  const hits = [...html.matchAll(new RegExp(`class="([^"]*)"[^>]*>\\s*${text}\\s*<`, "g"))];
  return [...new Set(hits.flatMap((m) => m[1].split(/\s+/).filter(Boolean)))];
}

const cssEscape = (cls: string) => cls.replace(/[^A-Za-z0-9_-]/g, (c) => `\\${c}`);

describe.each(THEMES)("шапка %s без логотипа — название сайта", (theme, seedTitle) => {
  it(`стартовое «${seedTitle}» → название сайта текстом, без картинки темы`, () => {
    const html = headerFromRevision(theme, { siteTitle: seedTitle, logo: "" });
    const links = homeLinks(html);
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links.filter((l) => l.includes(SHOP)).length).toBeGreaterThanOrEqual(2);
    expect(links.filter((l) => /<img\b/.test(l))).toEqual([]);
    expect(html).not.toMatch(new RegExp(`>\\s*${seedTitle}\\s*<`));
  });

  it("плейсхолдер /logo.svg — не логотип: тоже название текстом", () => {
    const html = headerFromRevision(theme, { siteTitle: seedTitle, logo: "https://abc.merfy.ru/logo.svg" });
    expect(html).not.toContain('src="https://abc.merfy.ru/logo.svg"');
    expect(homeLinks(html).filter((l) => l.includes(SHOP)).length).toBeGreaterThanOrEqual(2);
  });

  it("своё название мерчанта в шапке остаётся", () => {
    const html = headerFromRevision(theme, { siteTitle: OWN, logo: "" });
    expect(homeLinks(html).filter((l) => l.includes(OWN)).length).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain(SHOP);
  });

  it("загруженный логотип — картинкой во всех местах логотипа", () => {
    const html = headerFromRevision(theme, { siteTitle: seedTitle, logo: UPLOAD });
    const links = homeLinks(html);
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links.every((l) => l.includes(`src="${UPLOAD}"`))).toBe(true);
  });

  it("классы текстового логотипа есть в CSS темы (живая сборка их видит)", () => {
    const html = headerFromRevision(theme, { siteTitle: seedTitle, logo: "" });
    const classes = textClasses(html, SHOP);
    expect(classes.length).toBeGreaterThan(0);
    const css = readFileSync(resolve(SITES_ROOT, "dist", "theme-css", `${theme}.css`), "utf8");
    const dead = classes.filter((c) => !css.includes(`.${cssEscape(c)}`));
    expect(dead).toEqual([]);
  });
});
