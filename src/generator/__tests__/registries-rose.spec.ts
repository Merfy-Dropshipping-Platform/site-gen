/**
 * Tests for registries/rose.ts
 *
 * Validates:
 * - All 18 Puck component types are registered
 * - Import paths follow correct pattern
 * - Component kinds are correct (static vs island)
 * - Registry structure matches ComponentRegistryEntry interface
 */

import { roseRegistry } from "../registries/rose";
import type { ComponentRegistryEntry } from "../page-generator";

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
];

describe("roseRegistry", () => {
  it("is a non-empty object", () => {
    expect(typeof roseRegistry).toBe("object");
    expect(Object.keys(roseRegistry).length).toBeGreaterThan(0);
  });

  it("contains all 18 expected component types", () => {
    for (const componentType of EXPECTED_COMPONENTS) {
      expect(roseRegistry).toHaveProperty(componentType);
    }
    expect(Object.keys(roseRegistry)).toHaveLength(EXPECTED_COMPONENTS.length);
  });

  it("each entry has required ComponentRegistryEntry fields", () => {
    for (const [key, entry] of Object.entries(roseRegistry)) {
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

  it("import paths point to ../components/ directory", () => {
    for (const entry of Object.values(roseRegistry)) {
      expect(entry.importPath).toMatch(/^\.\.\/components\//);
    }
  });

  it("import paths end with .astro extension", () => {
    for (const entry of Object.values(roseRegistry)) {
      expect(entry.importPath).toMatch(/\.astro$/);
    }
  });

  it("entry names match their registry keys (or map to Astro file)", () => {
    // Each key should match the entry name
    for (const [key, entry] of Object.entries(roseRegistry)) {
      expect(entry.name).toBe(key);
    }
  });

  it("MainText maps to TextBlock.astro", () => {
    const mainText = roseRegistry["MainText"];
    expect(mainText).toBeDefined();
    expect(mainText.importPath).toContain("TextBlock.astro");
  });
});
