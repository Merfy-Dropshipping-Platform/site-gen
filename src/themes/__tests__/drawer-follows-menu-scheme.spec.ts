import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Баг 24 документа владельца «баги шапки и меню»: «Панель бокового меню
 * остаётся белой, цвета выбранной схемы меню к ней не применяются».
 *
 * Замер уточнил охват: в документе баг записан на bloom, а на деле
 * `menuColorScheme` доезжал до инлайн-навигации, но класс схемы на корень
 * шторки не вешала НИ ОДНА из пяти тем.
 *
 * Правка — класс схемы меню на корне шторки. Четыре темы после этого поехали, а
 * vanilla осталась белой: её полотно покрашено переменными темы `--vanilla-*`,
 * а не токенами схемы напрямую, поэтому ей нужен ещё слой переназначения в
 * global.css — тот же приём, что уже применён там к корзине-шторке.
 *
 * Замер после правки (фон полотна, без схемы меню → со «Схемой 3»):
 *   все пять: rgb(255,255,255) → rgb(20,30,60)
 */
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "flux", "satin", "vanilla"] as const;

const LINKS = [{ text: "Каталог", href: "/catalog" }];

function renderHeader(theme: string, menuScheme?: string): string {
  const props: Record<string, unknown> = {
    id: "Header-1",
    colorScheme: "scheme-1",
    menuType: "sidebar",
    logoPosition: "center-left",
    navigationLinks: LINKS,
    links: LINKS,
  };
  if (menuScheme) props.menuColorScheme = menuScheme;
  const out = execFileSync(
    "node",
    [RENDERER, theme, JSON.stringify([{ block: "Header", props, live: true }])],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const [res] = JSON.parse(out) as Array<{ html?: string; error?: string }>;
  if (res.error) throw new Error(`${theme}: ${res.error}`);
  return res.html ?? "";
}

/** Открывающий тег корня шторки. */
function drawerTag(html: string, theme: string): string {
  const at = html.indexOf(`id="${theme}-burger"`);
  if (at < 0) return "";
  const start = html.lastIndexOf("<", at);
  const end = html.indexOf(">", at);
  return end > start ? html.slice(start, end + 1) : "";
}

describe("шторка бокового меню берёт «Цветовую схему меню»", () => {
  it.each(THEMES)("%s: со схемой меню класс есть на корне шторки", (theme) => {
    const tag = drawerTag(renderHeader(theme, "scheme-3"), theme);
    expect({ theme, найденКорень: tag.length > 0 }).toEqual({ theme, найденКорень: true });
    expect({ theme, классСхемы: /color-scheme-3/.test(tag) }).toEqual({
      theme,
      классСхемы: true,
    });
  });

  it.each(THEMES)("%s: без схемы меню класс не навязывается", (theme) => {
    // Прежний вид сохраняется: шторка наследует схему секции, как до правки.
    const tag = drawerTag(renderHeader(theme), theme);
    expect({ theme, лишнийКласс: /color-scheme-\d/.test(tag) }).toEqual({
      theme,
      лишнийКласс: false,
    });
  });

  it("vanilla: переменные полотна переназначены на токены схемы", () => {
    // Без этого слоя класс на корне у vanilla инертен — полотно красится
    // `--vanilla-surface`, а не `--color-bg`.
    const css = readFileSync(
      resolve(ROOT, "themes", "vanilla", "src", "styles", "global.css"),
      "utf8",
    );
    const at = css.indexOf('#vanilla-burger[class*="color-scheme-"]');
    expect(at).toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toContain("--vanilla-surface: rgb(var(--color-bg))");
  });
});
