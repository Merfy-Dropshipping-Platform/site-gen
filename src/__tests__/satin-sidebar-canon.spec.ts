/**
 * Гард: сайдбары satin-секций (типы полей puckConfig) = канон theme-base (как в rose).
 * Source-based (читаем .ts как текст), потому что import-based сверка падает на
 * pre-existing type-ошибках в theme-base (defaults.textSize вне схемы в MainText/
 * MultiRows; packages вне tsconfig.build). Дефолты satin НЕ сверяем.
 *
 * Покрыты блоки, которые ДОЛЖНЫ совпадать. MultiRows/MultiColumns/Footer —
 * вне покрытия (открытые решения, см. отчёт сессии).
 */
import * as fs from "fs";
import * as path from "path";

function fieldTypes(file: string): Record<string, string> {
  const s = fs.readFileSync(file, "utf8");
  const fi = s.indexOf("fields: {");
  if (fi < 0) return {};
  let i = fi + "fields: {".length,
    depth = 1,
    body = "";
  while (i < s.length && depth > 0) {
    const c = s[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    if (depth > 0) body += c;
    i++;
  }
  const map: Record<string, string> = {};
  let d = 0,
    cur = "";
  const flush = (txt: string) => {
    const km = txt.match(/^[\s\n]*\[?'?([a-zA-Z_]\w*)'?/);
    const tm = txt.match(/type:\s*'([^']+)'/);
    if (km && tm) map[km[1]] = tm[1];
  };
  for (const ch of body) {
    if (ch === "{" || ch === "[" || ch === "(") d++;
    else if (ch === "}" || ch === "]" || ch === ")") d--;
    if (ch === "," && d === 0) {
      flush(cur);
      cur = "";
    } else cur += ch;
  }
  flush(cur);
  return map;
}

const PKG = path.resolve(__dirname, "../../packages");
const basePath = (b: string) =>
  path.join(PKG, "theme-base", "blocks", b, `${b}.puckConfig.ts`);
const satinPath = (b: string) =>
  path.join(PKG, "theme-satin", "blocks", b, `${b}.puckConfig.ts`);

const COVERED = [
  "Hero",
  "PopularProducts",
  "Collections",
  "MainText",
  "CollapsibleSection",
];

describe("satin section sidebars: field types == theme-base canon", () => {
  it.each(COVERED)("%s: satin field types match theme-base", (b) => {
    expect(fieldTypes(satinPath(b))).toEqual(fieldTypes(basePath(b)));
  });
});
