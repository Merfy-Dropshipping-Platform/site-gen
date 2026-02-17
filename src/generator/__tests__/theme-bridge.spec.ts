/**
 * Tests for theme-bridge.ts
 *
 * Bridge module that adapts the themes library types (packages/themes/types)
 * to the generator types used by page-generator, tokens-generator, etc.
 *
 * Validates:
 * - Converting theme ComponentRegistryEntry[] to generator registry Record
 * - Mapping island/islandDirective to kind/clientDirective
 * - Mapping astroTemplate to importPath
 * - Feature-based component filtering
 * - Theme settings schema to MerchantSettings tokens
 */

import {
  themeRegistryToGeneratorRegistry,
  themeSettingsToMerchantSettings,
  type ThemeRegistryEntry,
} from "../theme-bridge";

// -- Theme registry entry (from packages/themes/types) shape --

const STATIC_ENTRY: ThemeRegistryEntry = {
  name: "Hero",
  label: "Hero Banner",
  category: "hero",
  puckConfig: {},
  astroTemplate: "Hero.astro",
  island: false,
  schema: {},
};

const ISLAND_ENTRY: ThemeRegistryEntry = {
  name: "CartWidget",
  label: "Shopping Cart",
  category: "products",
  puckConfig: {},
  astroTemplate: "CartWidget.astro",
  island: true,
  islandDirective: "load",
  schema: {},
};

const VISIBLE_ISLAND: ThemeRegistryEntry = {
  name: "Reviews",
  label: "Customer Reviews",
  category: "content",
  puckConfig: {},
  astroTemplate: "Reviews.astro",
  island: true,
  islandDirective: "visible",
  schema: {},
};

const FEATURE_GATED: ThemeRegistryEntry = {
  name: "Newsletter",
  label: "Newsletter Signup",
  category: "content",
  puckConfig: {},
  astroTemplate: "Newsletter.astro",
  island: false,
  schema: {},
  requiredFeatures: ["newsletter"],
};

describe("themeRegistryToGeneratorRegistry", () => {
  it("converts static theme entries to generator registry format", () => {
    const result = themeRegistryToGeneratorRegistry([STATIC_ENTRY]);

    expect(result["Hero"]).toBeDefined();
    expect(result["Hero"].name).toBe("Hero");
    expect(result["Hero"].kind).toBe("static");
    expect(result["Hero"].importPath).toContain("Hero.astro");
  });

  it("converts island entries with correct client directive", () => {
    const result = themeRegistryToGeneratorRegistry([ISLAND_ENTRY]);

    expect(result["CartWidget"]).toBeDefined();
    expect(result["CartWidget"].kind).toBe("island");
    expect(result["CartWidget"].clientDirective).toBe("client:load");
  });

  it("maps islandDirective=visible to client:visible", () => {
    const result = themeRegistryToGeneratorRegistry([VISIBLE_ISLAND]);

    expect(result["Reviews"].clientDirective).toBe("client:visible");
  });

  it("generates correct import path for static Astro components", () => {
    const result = themeRegistryToGeneratorRegistry([STATIC_ENTRY]);

    // Static components imported from astro/ subdirectory
    expect(result["Hero"].importPath).toBe("../components/astro/Hero.astro");
  });

  it("generates correct import path for React islands", () => {
    const result = themeRegistryToGeneratorRegistry([ISLAND_ENTRY]);

    // Islands imported from react/ subdirectory (no .astro extension)
    expect(result["CartWidget"].importPath).toBe(
      "../components/react/CartWidget",
    );
  });

  it("converts multiple entries to a keyed record", () => {
    const result = themeRegistryToGeneratorRegistry([
      STATIC_ENTRY,
      ISLAND_ENTRY,
      VISIBLE_ISLAND,
    ]);

    expect(Object.keys(result)).toHaveLength(3);
    expect(result["Hero"]).toBeDefined();
    expect(result["CartWidget"]).toBeDefined();
    expect(result["Reviews"]).toBeDefined();
  });

  it("handles empty registry", () => {
    const result = themeRegistryToGeneratorRegistry([]);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("defaults island directive to client:load when not specified", () => {
    const entry: ThemeRegistryEntry = {
      ...ISLAND_ENTRY,
      islandDirective: undefined,
    };

    const result = themeRegistryToGeneratorRegistry([entry]);

    expect(result["CartWidget"].clientDirective).toBe("client:load");
  });

  it("accepts optional componentsBasePath", () => {
    const result = themeRegistryToGeneratorRegistry([STATIC_ENTRY], {
      componentsBasePath: "../../components",
    });

    expect(result["Hero"].importPath).toBe(
      "../../components/astro/Hero.astro",
    );
  });

  it("filters components by features when features provided", () => {
    const result = themeRegistryToGeneratorRegistry(
      [STATIC_ENTRY, FEATURE_GATED],
      { features: { newsletter: false } },
    );

    // Newsletter should be filtered out because newsletter=false
    expect(result["Hero"]).toBeDefined();
    expect(result["Newsletter"]).toBeUndefined();
  });

  it("includes feature-gated components when feature is enabled", () => {
    const result = themeRegistryToGeneratorRegistry(
      [STATIC_ENTRY, FEATURE_GATED],
      { features: { newsletter: true } },
    );

    expect(result["Hero"]).toBeDefined();
    expect(result["Newsletter"]).toBeDefined();
  });

  it("includes components without requiredFeatures regardless of feature flags", () => {
    const result = themeRegistryToGeneratorRegistry(
      [STATIC_ENTRY, FEATURE_GATED],
      { features: {} },
    );

    // Hero has no requiredFeatures, should be included
    expect(result["Hero"]).toBeDefined();
    // Newsletter requires "newsletter" which is not in features, should be excluded
    expect(result["Newsletter"]).toBeUndefined();
  });
});

describe("themeSettingsToMerchantSettings", () => {
  it("extracts font family from settings schema + overrides", () => {
    const schema = [
      {
        name: "Typography",
        settings: [
          {
            id: "font_heading",
            type: "font" as const,
            label: "Heading Font",
            default: "Inter",
          },
        ],
      },
    ];

    const result = themeSettingsToMerchantSettings(schema, {
      font_heading: "Playfair Display",
    });

    expect(result.tokens).toBeDefined();
    expect(result.tokens!["font-heading"]).toBe("Playfair Display");
  });

  it("uses defaults when no override provided", () => {
    const schema = [
      {
        name: "Colors",
        settings: [
          {
            id: "color_primary",
            type: "color" as const,
            label: "Primary Color",
            default: "#ff0000",
          },
        ],
      },
    ];

    const result = themeSettingsToMerchantSettings(schema, {});

    expect(result.tokens).toBeDefined();
    expect(result.tokens!["color-primary"]).toBe("#ff0000");
  });

  it("override takes precedence over default", () => {
    const schema = [
      {
        name: "Colors",
        settings: [
          {
            id: "color_primary",
            type: "color" as const,
            label: "Primary Color",
            default: "#ff0000",
          },
        ],
      },
    ];

    const result = themeSettingsToMerchantSettings(schema, {
      color_primary: "#00ff00",
    });

    expect(result.tokens!["color-primary"]).toBe("#00ff00");
  });

  it("handles range settings with units", () => {
    const schema = [
      {
        name: "Layout",
        settings: [
          {
            id: "page_width",
            type: "range" as const,
            label: "Page Width",
            default: 1200,
            unit: "px",
          },
        ],
      },
    ];

    const result = themeSettingsToMerchantSettings(schema, {});

    expect(result.tokens!["page-width"]).toBe("1200px");
  });

  it("handles range overrides", () => {
    const schema = [
      {
        name: "Layout",
        settings: [
          {
            id: "border_radius",
            type: "range" as const,
            label: "Border Radius",
            default: 4,
            unit: "px",
          },
        ],
      },
    ];

    const result = themeSettingsToMerchantSettings(schema, {
      border_radius: 12,
    });

    expect(result.tokens!["border-radius"]).toBe("12px");
  });

  it("handles multiple settings groups", () => {
    const schema = [
      {
        name: "Colors",
        settings: [
          {
            id: "color_primary",
            type: "color" as const,
            label: "Primary",
            default: "#000",
          },
        ],
      },
      {
        name: "Typography",
        settings: [
          {
            id: "font_body",
            type: "font" as const,
            label: "Body Font",
            default: "sans-serif",
          },
        ],
      },
    ];

    const result = themeSettingsToMerchantSettings(schema, {});

    expect(result.tokens!["color-primary"]).toBe("#000");
    expect(result.tokens!["font-body"]).toBe("sans-serif");
  });

  it("returns empty tokens for empty schema", () => {
    const result = themeSettingsToMerchantSettings([], {});

    expect(result.tokens).toBeDefined();
    expect(Object.keys(result.tokens!)).toHaveLength(0);
  });

  it("converts color schemes from theme settings", () => {
    const colorSchemes = [
      {
        name: "Light",
        background: "#ffffff",
        foreground: "#000000",
      },
      {
        name: "Dark",
        background: "#1a1a1a",
        foreground: "#ffffff",
      },
    ];

    const result = themeSettingsToMerchantSettings([], {}, colorSchemes);

    expect(result.colorSchemes).toBeDefined();
    expect(result.colorSchemes).toHaveLength(2);
    expect(result.colorSchemes![0].colors).toBeDefined();
    expect(result.colorSchemes![0].colors["background"]).toBe("#ffffff");
    expect(result.colorSchemes![0].colors["foreground"]).toBe("#000000");
  });
});
