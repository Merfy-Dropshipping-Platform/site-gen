#!/usr/bin/env node
/**
 * Генератор карт инлайн-SVG иконок шапки для тем.
 *
 * Зачем. Жалоба владельца (документ «баги шапки и меню», пункты про vanilla,
 * bloom и satin): «в схеме заданы Заголовок и Текст — текст меню перекрасился, а
 * иконки поиска, избранного, корзины и профиля остались прежними». Причина
 * механическая: NtIcon дизайн-системы рендерит `<img src="/icons/X.svg">`, а
 * <img> нельзя перекрасить CSS-цветом. В rose это уже решено вручную
 * (RoseNtIcon + ROSE_ICON_SVGS): иконка инлайнится в разметку, все stroke/fill
 * заменены на currentColor, и она следует --color-text активной схемы.
 *
 * Здесь то же самое, но автоматически и ПО СОБСТВЕННЫМ файлам каждой темы —
 * геометрия иконок у тем разная, подставить карту rose нельзя.
 *
 * Карта пишется литералом в трекаемый .ts, а не читается на лету: import.meta.glob
 * и `?raw` работают только в Vite-сборке (live) и падают в compile-theme-sections
 * (esbuild, превью конструктора) — та же причина, что записана в rose-icon-svgs.ts.
 *
 * Запуск: node scripts/generate-theme-icon-svgs.mjs [тема ...]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();

/** Иконки шапки, которые обязаны следовать цвету схемы. */
const HEADER_ICONS = [
  "menu-burger",
  "menu-close",
  "search-lg",
  "search-sm",
  "favourite",
  "cart",
  "cart-sm",
  "user",
  "user-sm",
];

const THEMES = ["bloom", "flux", "satin", "vanilla"];

/**
 * Приводит экспортированный из Figma SVG к канону инлайна:
 *  - цвета → currentColor (кроме законного fill="none");
 *  - снимается preserveAspectRatio="none" — квадратный контейнер искажал
 *    иконки с НЕ-квадратным viewBox (замечание из rose-icon-svgs.ts);
 *  - снимаются жёсткие width/height — размер задаёт sizeClass;
 *  - схлопываются переводы строк, чтобы карта читалась одной строкой.
 */
function toInline(svg) {
  let out = svg;
  out = out.replace(/\s*preserveAspectRatio="[^"]*"/g, "");
  // ВАЖНО: только самостоятельные width/height. Без \s перед именем правило
  // вырезало «width» внутри stroke-width и ломало толщину линии иконки.
  out = out.replace(/\s(width|height)="[^"]*"/g, "");
  out = out.replace(/\s*style="[^"]*"/g, "");
  out = out.replace(/\s*overflow="[^"]*"/g, "");
  out = out.replace(/(stroke|fill)="(?!none")[^"]*"/g, '$1="currentColor"');
  out = out.replace(/\s*\n\s*/g, "");
  return out.trim();
}

/**
 * Ключи уже существующей карты. У flux и rose такие карты были заведены руками
 * ДО этого скрипта и содержат не только иконки шапки (стрелки подвала и
 * пагинации). Перезапись их теряла — поэтому генератор ДОПОЛНЯЕТ: существующие
 * записи остаются как есть, добавляются только недостающие иконки шапки.
 */
function existingEntries(outFile) {
  if (!existsSync(outFile)) return [];
  const src = readFileSync(outFile, "utf8");
  const found = [];
  const re = /^\t"?([A-Za-z0-9-]+)"?:\s*`([\s\S]*?)`,$/gm;
  let m;
  while ((m = re.exec(src))) found.push([m[1], m[2]]);
  return found;
}

function generate(theme) {
  const iconsDir = resolve(ROOT, "themes", theme, "public", "icons");
  const outFileEarly = resolve(ROOT, "themes", theme, "src", "components", "icons", `${theme}-icon-svgs.ts`);
  const kept = existingEntries(outFileEarly);
  const have = new Set(kept.map(([k]) => k));
  const entries = [...kept];
  const missing = [];
  for (const name of HEADER_ICONS) {
    if (have.has(name)) continue;
    const file = resolve(iconsDir, `${name}.svg`);
    if (!existsSync(file)) {
      missing.push(name);
      continue;
    }
    entries.push([name, toInline(readFileSync(file, "utf8"))]);
  }
  const constName = `${theme.toUpperCase()}_ICON_SVGS`;
  const body = entries
    .map(([name, svg]) => `\t${JSON.stringify(name)}: \`${svg.replace(/`/g, "\\`")}\`,`)
    .join("\n");
  const header = `// Дополняется scripts/generate-theme-icon-svgs.mjs. Существующие записи скрипт НЕ трогает.
//
// Инлайн-SVG иконок шапки темы «${theme}» (источник: themes/${theme}/public/icons/*.svg).
// Все stroke/fill заменены на currentColor: иконка следует --color-text активной
// цветовой схемы. Раньше иконки были <img> и схемой не красились — жалоба
// владельца по vanilla, bloom и satin в документе «баги шапки и меню».
//
// Литерал, а НЕ import.meta.glob/?raw: те работают только в Vite-сборке и падают
// в compile-theme-sections (esbuild, превью конструктора).
//
// Пересборка: node scripts/generate-theme-icon-svgs.mjs ${theme}
export const ${constName}: Record<string, string> = {
${body}
};
`;
  const outFile = outFileEarly;
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, header, "utf8");
  return { theme, written: entries.length, missing, outFile };
}

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : THEMES;
for (const theme of wanted) {
  const r = generate(theme);
  console.log(
    `${r.theme}: ${r.written} иконок → ${r.outFile.replace(ROOT + "/", "")}` +
      (r.missing.length ? ` (нет файлов: ${r.missing.join(", ")})` : ""),
  );
}
