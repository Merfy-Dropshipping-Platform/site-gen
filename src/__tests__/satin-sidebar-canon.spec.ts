/**
 * Гард: сайдбары satin-секций (типы полей puckConfig) = канон theme-base (как в rose).
 * Source-based (читаем .ts как текст), потому что import-based сверка падает на
 * pre-existing type-ошибках в theme-base (defaults.textSize вне схемы в MainText/
 * MultiRows; packages вне tsconfig.build). Дефолты satin НЕ сверяем.
 *
 * Покрыты все блоки, у которых есть порт satin. Осознанные расхождения satin
 * (их три, все со ссылкой на Figma или на миграцию данных) вынесены в
 * KNOWN_DIVERGENCES: гард продолжает сторожить эти блоки от НОВОГО расхождения,
 * но не требует менять состав параметров, который никто не согласовывал.
 *
 * 20.09: парсер начал срезать комментарии. До этого текст комментария попадал
 * в разбор полей, и сверка врала в обе стороны: у ImageWithText и Footer
 * «расхождения» были призраками (в каноне значился несуществующий параметр
 * `but` — слово из комментария), а настоящее расхождение Hero (`padding`
 * скрыт у satin) гард не видел вовсе.
 */
import * as fs from "fs";
import * as path from "path";

/** Комментарии — не поля: без этого в разбор попадают слова из пояснений. */
function stripComments(src: string): string {
  return src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

function fieldTypes(file: string): Record<string, string> {
  const s = stripComments(fs.readFileSync(file, "utf8"));
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
  "Header",
  "Hero",
  "PopularProducts",
  "Collections",
  "MainText",
  "CollapsibleSection",
  "ImageWithText",
  "MultiRows",
  "MultiColumns",
  "Footer",
];

/**
 * Осознанные расхождения satin. Ключ — блок, значение — поле → [канон, satin].
 * Каждое подпёрто комментарием в самом puckConfig satin; менять состав
 * параметров, чтобы «свести к канону», нельзя — он согласован отдельно.
 */
const KNOWN_DIVERGENCES: Record<string, Record<string, [string, string]>> = {
  // «Отступов» нет в Figma 314-34815 — контрол скрыт, значение в данных
  // остаётся (Hero.astro его читает).
  Hero: { padding: ["padding", "hidden"] },
  // satin показывает тумблер контейнера и прячет его схему — обратно канону,
  // где тумблер скрыт, а схема видима (Figma 314-34963).
  MultiRows: {
    containerEnabled: ["hidden", "toggle"],
    containerColorScheme: ["colorScheme", "hidden"],
  },
  // Legacy-ключ, оставленный скрытым ради миграции старых ревизий: рендер
  // читает и его, и новый containerEnabled.
  MultiColumns: { background: ["—", "hidden"] },
};

describe("satin section sidebars: field types == theme-base canon", () => {
  it.each(COVERED)("%s: satin field types match theme-base", (b) => {
    const base = fieldTypes(basePath(b));
    const satin = fieldTypes(satinPath(b));
    const known = KNOWN_DIVERGENCES[b] ?? {};
    // Известные расхождения выводим из сверки — но только те, что ВСЁ ЕЩЁ
    // расходятся ровно так, как записано. Иначе список тихо протухает и
    // начинает прятать новое расхождение вместо старого.
    for (const [field, [expectBase, expectSatin]] of Object.entries(known)) {
      expect({ блок: b, поле: field, канон: base[field] ?? "—", satin: satin[field] ?? "—" }).toEqual({
        блок: b,
        поле: field,
        канон: expectBase,
        satin: expectSatin,
      });
      delete base[field];
      delete satin[field];
    }
    expect(satin).toEqual(base);
  });
});
