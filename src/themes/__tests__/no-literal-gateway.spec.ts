import { globSync, readFileSync } from "fs";
import * as path from "path";

/**
 * Гард spec 116: темы, шаблоны и генератор не зашивают адрес прод-шлюза.
 * Литерал допустим только как запасное значение после `??` или `||` (и как DEFAULT_API_URL в api-url.ts):
 * иначе dev-витрина ходила бы в прод-API. Кодмод: scripts/codemods/api-url-from-env.mjs.
 */
const ROOT = path.resolve(__dirname, "../../..");
const PATTERNS = ["themes/*/src/**/*.{astro,ts,tsx}", "templates/astro/**/*.{astro,ts}", "packages/theme-base/**/*.{astro,ts,tsx}", "src/generator/**/*.ts"];
const skip = (f: string) => f.includes("node_modules") || f.includes("/dist/") || f.includes("__tests__");
const FILES = PATTERNS.flatMap((p) => globSync(p, { cwd: ROOT })).filter((f) => !skip(f));
const LITERAL = /["'`]https:\/\/gateway\.merfy\.ru(\/api)?["'`]/;
const ALLOWED = /(\?\?|\|\|)\s*["'`]https:\/\/gateway\.merfy\.ru(\/api)?["'`]|^\s*(export )?const DEFAULT_API_(URL|BASE) = /;
const COMMENT = /^\s*(\/\/|\/?\*)/;
const CONTINUES_FALLBACK = (prev: string) => /(\?\?|\|\|)\s*$/.test(prev.trim());

describe("темы и генератор не зашивают прод-шлюз", () => {
  it("список файлов не пуст", () => expect(FILES.length).toBeGreaterThan(100));
  it.each(FILES)("%s", (f) => {
    const lines = readFileSync(path.join(ROOT, f), "utf8").split("\n");
    const bad = lines
      .map((line, i) => ({ line, i: i + 1, prev: lines[i - 1] ?? "" }))
      .filter(({ line, prev }) => LITERAL.test(line) && !ALLOWED.test(line) && !COMMENT.test(line) && !CONTINUES_FALLBACK(prev));
    expect(bad.map(({ i, line }) => `${i}: ${line.trim()}`)).toEqual([]);
  });
});
