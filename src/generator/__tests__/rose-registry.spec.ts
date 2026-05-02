/**
 * Tests for the new packages-only Rose registry.
 *
 * Validates that all blocks in roseRegistry import from
 * `@merfy/theme-base/blocks/<Block>/<Block>.astro` and that each
 * referenced .astro file actually exists in `packages/theme-base/blocks/`.
 *
 * Spec 082 W2 — switching live build for Rose to packages-only path.
 */

import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { roseRegistry } from "../registries/rose";

describe("roseRegistry — packages-only", () => {
  // ROOT = sites service root (where packages/ lives)
  // __dirname is .../src/generator/__tests__, so up 3 levels.
  const ROOT = resolve(__dirname, "../../..");

  it("все блоки указывают на @merfy/theme-base/blocks/", () => {
    for (const [, entry] of Object.entries(roseRegistry)) {
      if (entry.kind !== "static") continue;
      expect(entry.importPath).toMatch(/^@merfy\/theme-base\/blocks\//);
      expect(entry.importPath).not.toMatch(/templates\/astro\/rose/);
    }
  });

  it("все целевые .astro файлы существуют в packages/theme-base/blocks/", () => {
    for (const [, entry] of Object.entries(roseRegistry)) {
      if (entry.kind !== "static") continue;
      // importPath like '@merfy/theme-base/blocks/Hero/Hero.astro'
      const relPath = entry.importPath.replace(
        "@merfy/theme-base/",
        "packages/theme-base/",
      );
      const fullPath = resolve(ROOT, relPath);
      expect(existsSync(fullPath)).toBe(true);
    }
  });
});
