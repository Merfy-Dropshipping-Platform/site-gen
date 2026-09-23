/**
 * Гард словаря: ядро sites знает только про "расширения" (extension) в
 * общем виде -- никогда про конкретное доменное название одного из них
 * (программы лояльности и т.п.). Маркеры блоков политики -- `<!-- ext:<id> -->`,
 * без привязки к смыслу расширения.
 *
 * Проверено вручную на момент написания (2026-09-23): совпадений `loyalt`/
 * `лояльн` по всему src/**\/*.ts нет -- поэтому гард охватывает весь src
 * целиком, сужать до src/policy/** не потребовалось.
 */
import * as fs from "fs";
import * as path from "path";

const SRC_ROOT = path.resolve(__dirname, "..");
const SELF_FILE = path.resolve(__filename);
const FORBIDDEN = /loyalt|лояльн/i;
const SKIP_DIR_NAMES = new Set(["node_modules", "dist"]);

function collectTsFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      files.push(...collectTsFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("словарь: sites не называет расширения по домену (loyalty и т.п.)", () => {
  it('ни один файл src/**/*.ts не содержит "loyalty"/"лояльн" (кроме самого гарда)', () => {
    const offenders: string[] = [];

    for (const file of collectTsFiles(SRC_ROOT)) {
      if (path.resolve(file) === SELF_FILE) continue;

      const content = fs.readFileSync(file, "utf8");
      if (FORBIDDEN.test(content)) {
        offenders.push(path.relative(SRC_ROOT, file));
      }
    }

    expect(offenders).toEqual([]);
  });
});
