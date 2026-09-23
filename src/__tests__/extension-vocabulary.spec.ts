/**
 * Гард словаря: ядро sites и theme-base знают только про "расширения"
 * (extension) в общем виде -- никогда про конкретное доменное название
 * одного из них (программы лояльности, баллы и т.п.). Маркеры блоков
 * политики -- `<!-- ext:<id> -->`, без привязки к смыслу расширения.
 *
 * Проверено вручную на момент написания (2026-09-23): совпадений `loyalt`/
 * `лояльн` по всему src/**\/*.ts нет -- поэтому гард охватывает весь src
 * целиком, сужать до src/policy/** не потребовалось.
 *
 * PR-19 («Три точки расширений на витрине») расширил охват на
 * `packages/theme-base` (и `.astro`, не только `.ts` -- блоки живут в
 * `.astro`) и добавил "балл"/"балла"/"баллов" в запрещённый список: весь
 * текст витрины (note/control/label/…) обязан прийти с бэка через контракт
 * `GET /store/extensions/storefront`, а не быть зашит в блок или рантайм.
 */
import * as fs from "fs";
import * as path from "path";

const SELF_FILE = path.resolve(__filename);
const FORBIDDEN = /loyalt|лояльн|балл/i;
const SKIP_DIR_NAMES = new Set(["node_modules", "dist", ".astro"]);
/** Каждый корень сканируется на свои расширения (см. `EXTENSIONS_BY_ROOT`). */
const SCAN_ROOTS = [
  path.resolve(__dirname, ".."),
  path.resolve(__dirname, "../../packages/theme-base"),
];
const EXTENSIONS_BY_ROOT: Record<string, readonly string[]> = {
  [SCAN_ROOTS[0]]: [".ts"],
  [SCAN_ROOTS[1]]: [".ts", ".astro"],
};

function collectFiles(dir: string, extensions: readonly string[]): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      files.push(...collectFiles(fullPath, extensions));
      continue;
    }

    if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("словарь: sites не называет расширения по домену (loyalty/баллы и т.п.)", () => {
  it('ни один файл src/**/*.ts или packages/theme-base/**/*.{ts,astro} не содержит "loyalty"/"лояльн"/"балл" (кроме самого гарда)', () => {
    const offenders: string[] = [];

    for (const root of SCAN_ROOTS) {
      for (const file of collectFiles(root, EXTENSIONS_BY_ROOT[root])) {
        if (path.resolve(file) === SELF_FILE) continue;

        const content = fs.readFileSync(file, "utf8");
        if (FORBIDDEN.test(content)) {
          offenders.push(path.relative(root, file));
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
