/**
 * Tests for registries/rose.ts
 *
 * Validates:
 * - All 21 Puck component types are registered (spec 082 W2 + W6 + Phase B
 *   Catalog mapping: 18 legacy blocks + CartSection + CheckoutSection +
 *   Catalog)
 * - Import paths follow the relative consumption pattern
 *   `../components/<X>.astro` (assembler копирует source из
 *   packages/theme-base/blocks/ в isolated build scaffold)
 * - Component kinds are correct (static vs island)
 * - Registry structure matches ComponentRegistryEntry interface
 *
 * Spec 082 Stage 1 W2/T12.5: Rose live build использует packages-only
 * source-of-truth (assembler копирует из packages/theme-base/blocks/),
 * но consumption side (importPath в registry) — relative path. T12 попыталась
 * прописать workspace alias напрямую, но Vite/Rollup не resolved alias
 * в isolated build dir → revert на relative path в T12.5.
 */

import { roseRegistry } from "../registries/rose";

/** All expected Puck component types in Rose theme */
const EXPECTED_COMPONENTS = [
  "Header",
  "Hero",
  "Footer",
  "MainText",
  "PopularProducts",
  "Collections",
  "ContactForm",
  "Gallery",
  "PromoBanner",
  "ImageWithText",
  "Newsletter",
  "Video",
  "Slideshow",
  "MultiColumns",
  "MultiRows",
  "CollapsibleSection",
  "Publications",
  "Product",
  "CartSection",
  "CheckoutSection",
  "Catalog",
];

describe("roseRegistry", () => {
  it("is a non-empty object", () => {
    expect(typeof roseRegistry).toBe("object");
    expect(Object.keys(roseRegistry).length).toBeGreaterThan(0);
  });

  it("contains all 21 expected component types", () => {
    for (const componentType of EXPECTED_COMPONENTS) {
      expect(roseRegistry).toHaveProperty(componentType);
    }
    expect(Object.keys(roseRegistry)).toHaveLength(EXPECTED_COMPONENTS.length);
  });

  it("each entry has required ComponentRegistryEntry fields", () => {
    for (const [, entry] of Object.entries(roseRegistry)) {
      expect(entry).toHaveProperty("name");
      expect(entry).toHaveProperty("kind");
      expect(entry).toHaveProperty("importPath");
      expect(typeof entry.name).toBe("string");
      expect(["island", "static"]).toContain(entry.kind);
      expect(typeof entry.importPath).toBe("string");
    }
  });

  it("all entries are static components", () => {
    for (const entry of Object.values(roseRegistry)) {
      expect(entry.kind).toBe("static");
    }
  });

  it("import paths point to ../components/ (relative consumption path)", () => {
    for (const entry of Object.values(roseRegistry)) {
      expect(entry.importPath).toMatch(/^\.\.\/components\//);
      // Must NOT use the legacy templates path.
      expect(entry.importPath).not.toMatch(/templates\/astro\/rose/);
      // Must NOT use workspace alias (Vite/Rollup can't resolve in
      // isolated build dir — see T12.5 fix).
      expect(entry.importPath).not.toMatch(/@merfy\//);
    }
  });

  it("import paths end with .astro extension", () => {
    for (const entry of Object.values(roseRegistry)) {
      expect(entry.importPath).toMatch(/\.astro$/);
    }
  });

  it("entry names match their registry keys", () => {
    for (const [key, entry] of Object.entries(roseRegistry)) {
      expect(entry.name).toBe(key);
    }
  });

  it("MainText maps to ../components/MainText.astro (was TextBlock.astro pre-082 W2)", () => {
    const mainText = roseRegistry["MainText"];
    expect(mainText).toBeDefined();
    expect(mainText.importPath).toBe("../components/MainText.astro");
  });
});
