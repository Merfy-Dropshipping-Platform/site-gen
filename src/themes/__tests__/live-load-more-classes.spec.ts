/**
 * Кнопка «Смотреть ещё» каталога должна быть видна на ЖИВОЙ витрине.
 *
 * Баг 28.09 (витрина тестировщика eeezt2btnhp0, bloom, 21 товар при 12 на
 * странице): «нет пагинации». Кнопка в разметке была и скрипт её показывал,
 * но фон `bg-[rgb(var(--color-button-bg,207_122_139))]` жил только в порте
 * `packages/theme-bloom/blocks/Catalog/Catalog.astro`. Живая сборка CSS темы
 * порты не сканирует, правила не было, фон прозрачный — текст цвета кнопки
 * сливался с фоном секции. Так с 16.06 (раскатка каталога, 7d086c2a).
 *
 * Превью конструктора собирается иначе (сканирует порты целиком), поэтому
 * `theme-port-utilities.spec.ts` эту дыру не видит: там судят бандл превью.
 * Здесь — источники живой сборки: `@source` из `themes/<t>/src/styles/global.css`
 * плюс сама папка темы (её Tailwind 4 сканирует автоматически). Весь порт в
 * живую сборку не подключаем: это оживило бы и другие классы каталога и сдвинуло
 * вид витрин (memory: reference_live_css_skips_port_blocks).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "vanilla", "flux", "bloom", "satin"] as const;

/** `@source` Tailwind → регулярка по абсолютному пути: `**`, `*`, `{a,b}`. */
function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (glob.startsWith("**/", i)) {
      re += "(?:.*/)?";
      i += 2;
    } else if (c === "*") re += "[^/]*";
    else if (c === "{") {
      const end = glob.indexOf("}", i);
      re += `(?:${glob.slice(i + 1, end).split(",").map(escapeRe).join("|")})`;
      i = end;
    } else re += escapeRe(c);
  }
  return new RegExp(`^${re}$`);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Тексты файлов, классы из которых попадают в CSS живой витрины темы. */
function liveSourcesText(theme: string): string {
  const cssPath = join(SITES_ROOT, "themes", theme, "src", "styles", "global.css");
  const css = readFileSync(cssPath, "utf8");
  const files = new Set(walk(join(SITES_ROOT, "themes", theme, "src")));
  for (const [, pattern] of css.matchAll(/^@source\s+"([^"]+)"/gm)) {
    if (pattern.includes("node_modules")) continue;
    const abs = resolve(dirname(cssPath), pattern);
    const base = abs.slice(0, abs.search(/[*{]/)).replace(/\/[^/]*$/, "");
    const re = globToRegExp(abs);
    for (const f of walk(base)) if (re.test(f)) files.add(f);
  }
  return [...files].map((f) => readFileSync(f, "utf8")).join("\n");
}

function loadMoreClasses(theme: string): string[] {
  const port = join(SITES_ROOT, "packages", `theme-${theme}`, "blocks", "Catalog", "Catalog.astro");
  const src = readFileSync(port, "utf8");
  const out = new Set<string>();
  for (const [tag] of src.matchAll(/<button\b[^>]*data-action="load-more"[^>]*>/g)) {
    const cls = /\bclass="([^"]*)"/.exec(tag)?.[1] ?? "";
    for (const c of cls.split(/\s+/)) if (c) out.add(c);
  }
  return [...out];
}

/** Класс встречается как токен разметки или как селектор в CSS темы (`.x:hover`). */
const hasToken = (text: string, token: string) =>
  new RegExp(`(^|[\\s"'\`{}.])${escapeRe(token)}($|[\\s"'\`{}:,])`, "m").test(text);

describe("кнопка «Смотреть ещё» каталога: классы доходят до CSS живой витрины", () => {
  it.each(THEMES)("%s", (theme) => {
    const classes = loadMoreClasses(theme);
    expect(classes.length).toBeGreaterThan(0);
    const text = liveSourcesText(theme);
    const missing = classes.filter((c) => !hasToken(text, c));
    expect(missing).toEqual([]);
  });
});
