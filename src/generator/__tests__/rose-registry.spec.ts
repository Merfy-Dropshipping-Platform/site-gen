/**
 * Tests for the packages-only Rose registry.
 *
 * Validates two invariants (spec 082 W2):
 *
 *  1. CONSUMPTION: все importPath = `../components/<X>.astro` (relative
 *     path который assembleFromPackages set up, копируя source файл из
 *     packages/theme-base/blocks/ в isolated build scaffold). НЕ должно
 *     быть references на legacy `templates/astro/rose/...` или на
 *     workspace alias `@merfy/...` (Vite/Rollup не resolved alias в
 *     isolated dir).
 *
 *  2. SOURCE-OF-TRUTH: каждому registry entry соответствует source файл
 *     в packages/theme-base/blocks/<X>/<X>.astro. Это и есть
 *     «packages-only» property: блоки live в packages/, не в legacy
 *     templates/astro/rose/.
 *
 * История: T12 попыталась прописать workspace alias напрямую → build
 * failed в isolated dir. T12.5 revert на relative path; packages-only
 * property сохраняется через assembler (см. assembleFromPackages).
 */

import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { roseRegistry } from "../registries/rose";

describe("roseRegistry — packages-only", () => {
  // ROOT = sites service root (where packages/ lives)
  // __dirname is .../src/generator/__tests__, so up 3 levels.
  const ROOT = resolve(__dirname, "../../..");

  it("все блоки указывают на относительный путь ../components/", () => {
    for (const [, entry] of Object.entries(roseRegistry)) {
      if (entry.kind !== "static") continue;
      expect(entry.importPath).toMatch(/^\.\.\/components\/[A-Z]\w+\.astro$/);
      expect(entry.importPath).not.toMatch(/templates\/astro\/rose/);
      expect(entry.importPath).not.toMatch(/@merfy\//);
    }
  });

  it("каждому registry-entry соответствует source файл в packages/theme-base/blocks/", () => {
    for (const [, entry] of Object.entries(roseRegistry)) {
      if (entry.kind !== "static") continue;
      // entry.importPath like '../components/Header.astro'
      // → source-of-truth file: packages/theme-base/blocks/Header/Header.astro
      const blockDir = entry.importPath
        .replace("../components/", "")
        .replace(".astro", "");
      const sourcePath = resolve(
        ROOT,
        "packages/theme-base/blocks",
        blockDir,
        `${blockDir}.astro`,
      );
      expect(existsSync(sourcePath)).toBe(true);
    }
  });
});
