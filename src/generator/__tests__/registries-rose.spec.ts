/**
 * Tests for registries/rose.ts
 *
 * Validates:
 * - All 20 Puck component types are registered (spec 082 W2 + W6:
 *   18 legacy blocks + CartSection + CheckoutSection)
 * - Import paths follow the packages-only pattern
 *   `@merfy/theme-base/blocks/<X>/<X>.astro`
 * - Component kinds are correct (static vs island)
 * - Registry structure matches ComponentRegistryEntry interface
 *
 * Spec 082 Stage 1 W2: Rose live build switched from
 * `templates/astro/rose/src/components/<X>.astro` to packages-only.
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
];

describe("roseRegistry", () => {
  it("is a non-empty object", () => {
    expect(typeof roseRegistry).toBe("object");
    expect(Object.keys(roseRegistry).length).toBeGreaterThan(0);
  });

  it("contains all 20 expected component types", () => {
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

  it("import paths point to @merfy/theme-base/blocks/ (packages-only)", () => {
    for (const entry of Object.values(roseRegistry)) {
      expect(entry.importPath).toMatch(/^@merfy\/theme-base\/blocks\//);
      // Must NOT use the legacy templates path anymore.
      expect(entry.importPath).not.toMatch(/templates\/astro\/rose/);
      expect(entry.importPath).not.toMatch(/^\.\.\/components\//);
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

  it("MainText maps to MainText/MainText.astro (was TextBlock.astro pre-082 W2)", () => {
    const mainText = roseRegistry["MainText"];
    expect(mainText).toBeDefined();
    expect(mainText.importPath).toBe(
      "@merfy/theme-base/blocks/MainText/MainText.astro",
    );
  });
});
