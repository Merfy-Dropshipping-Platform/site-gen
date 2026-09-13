import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

/**
 * Пункт 13, часть «внешним видом»: одна и та же настройка «Цветовая схема меню»
 * обязана давать одну и ту же разметку независимо от того, каким путём пропс
 * доехал до шапки.
 *
 * Замер (flux, QA-сайт 8df3b745…, 2026-09-13): на главной `<nav>` шёл БЕЗ
 * класса `color-scheme-1`, а на каталоге/о нас/корзине/товаре/`/account/profile`
 * — С ним, при идентичных props в ревизии. Причина: платформа отдаёт схему то
 * строкой `"scheme-1"`, то числом `1` (нормализатор `page-blocks` приводит
 * `colorScheme` к числу, а `menuColorScheme` — нет), а порты тем проверяли
 * `typeof p.menuColorScheme === "string"` и на числе молча не срабатывали.
 * Ровно про это предупреждает комментарий в satin (`Header.astro:103`) — satin
 * уже чинили, остальные четыре темы остались с прежней проверкой.
 *
 * Инвариант: число `1` и строка `"scheme-1"` дают одинаковый класс схемы меню.
 */
const baseProps = {
  id: "Header-1",
  siteTitle: "Магазин",
  logo: "",
  logoPosition: "top-left",
  menuType: "dropdown",
  colorScheme: 2,
  padding: { top: 24, bottom: 24 },
  navigationLinks: [{ label: "Каталог", href: "/catalog" }],
  actionButtons: { showSearch: true, showCart: true, showProfile: true },
};

function render(theme: string, menuColorScheme: unknown): string {
  const jobs = [{ block: "Header", props: { ...baseProps, menuColorScheme } }];
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const rows = JSON.parse(raw) as { html?: string; error?: string; missing?: boolean }[];
  if (rows[0]?.missing) return "(нет секции)";
  if (rows[0]?.error) return `ОШИБКА: ${rows[0].error}`;
  return rows[0]?.html ?? "";
}

/** Классы схемы, навешенные на десктопный <nav> шапки. */
function navSchemeClasses(html: string): string[] {
  const nav = /<nav\b[^>]*>/i.exec(html);
  if (!nav) return [];
  return (nav[0].match(/color-scheme-\d+/g) ?? []).sort();
}

describe.each(THEMES)("шапка — схема меню не зависит от записи (%s)", (theme) => {
  const built = existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  );

  it("секции темы собраны (pnpm build:theme-sections)", () => {
    expect(built).toBe(true);
  });

  it('число 1 и строка "scheme-1" дают одинаковую схему меню', () => {
    if (!built) return;
    const asNumber = render(theme, 1);
    const asString = render(theme, "scheme-1");
    if (asNumber === "(нет секции)") return;
    expect(asNumber).not.toMatch(/^ОШИБКА/);
    expect(asString).not.toMatch(/^ОШИБКА/);
    expect(navSchemeClasses(asNumber)).toEqual(navSchemeClasses(asString));
  });

  it("схема меню вообще доезжает до <nav> (настройка не мёртвая)", () => {
    if (!built) return;
    const html = render(theme, "scheme-1");
    if (html === "(нет секции)") return;
    expect(navSchemeClasses(html)).toContain("color-scheme-1");
  });
});
