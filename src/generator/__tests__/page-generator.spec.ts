/**
 * Tests for page-generator.ts
 *
 * Validates:
 * - Correct .astro file generation from Puck JSON + registry
 * - React Islands get client:* directives
 * - Astro components import directly
 * - Props serialization (strings, booleans, numbers, objects)
 * - Nested content (slots)
 * - Unknown components produce placeholder comments
 * - Layout wrapping
 * - Import deduplication
 */

import {
  generateAstroPage,
  type ComponentRegistryEntry,
  type PuckPageData,
} from "../page-generator";

// -- Helpers --

function makeRegistry(
  entries: Array<{
    name: string;
    kind: "island" | "static";
    importPath: string;
    clientDirective?: "client:load" | "client:visible" | "client:idle";
  }>,
): Record<string, ComponentRegistryEntry> {
  const reg: Record<string, ComponentRegistryEntry> = {};
  for (const e of entries) {
    reg[e.name] = e;
  }
  return reg;
}

const STATIC_HERO: ComponentRegistryEntry = {
  name: "Hero",
  kind: "static",
  importPath: "../components/Hero.astro",
};

const ISLAND_CART: ComponentRegistryEntry = {
  name: "CartWidget",
  kind: "island",
  importPath: "../components/react/CartWidget",
  clientDirective: "client:load",
};

const ISLAND_VISIBLE: ComponentRegistryEntry = {
  name: "Reviews",
  kind: "island",
  importPath: "../components/react/Reviews",
  clientDirective: "client:visible",
};

const STATIC_FOOTER: ComponentRegistryEntry = {
  name: "Footer",
  kind: "static",
  importPath: "../components/Footer.astro",
};

// -- Tests --

describe("generateAstroPage", () => {
  it("generates frontmatter with --- delimiters", () => {
    const page: PuckPageData = { content: [] };
    const result = generateAstroPage(page, {});

    expect(result).toMatch(/^---\n/);
    expect(result).toMatch(/\n---\n/);
  });

  it("generates imports for static Astro components", () => {
    const registry = makeRegistry([
      { name: "Hero", kind: "static", importPath: "../components/Hero.astro" },
    ]);
    const page: PuckPageData = {
      content: [{ type: "Hero", props: { title: "Welcome" } }],
    };

    const result = generateAstroPage(page, registry);

    expect(result).toContain(
      "import Hero from '../components/Hero.astro';",
    );
  });

  it("generates imports for React Islands with client directive", () => {
    const registry: Record<string, ComponentRegistryEntry> = {
      CartWidget: ISLAND_CART,
    };
    const page: PuckPageData = {
      content: [{ type: "CartWidget" }],
    };

    const result = generateAstroPage(page, registry);

    expect(result).toContain(
      "import CartWidget from '../components/react/CartWidget';",
    );
    expect(result).toContain("client:load");
  });

  it("uses client:visible directive when specified", () => {
    const registry: Record<string, ComponentRegistryEntry> = {
      Reviews: ISLAND_VISIBLE,
    };
    const page: PuckPageData = {
      content: [{ type: "Reviews" }],
    };

    const result = generateAstroPage(page, registry);

    expect(result).toContain("client:visible");
    expect(result).not.toContain("client:load");
  });

  it("defaults island directive to client:load when not specified", () => {
    const registry: Record<string, ComponentRegistryEntry> = {
      Widget: {
        name: "Widget",
        kind: "island",
        importPath: "../components/react/Widget",
        // no clientDirective specified
      },
    };
    const page: PuckPageData = {
      content: [{ type: "Widget" }],
    };

    const result = generateAstroPage(page, registry);

    expect(result).toContain("client:load");
  });

  it("serializes string props as quoted attributes", () => {
    const registry: Record<string, ComponentRegistryEntry> = {
      Hero: STATIC_HERO,
    };
    const page: PuckPageData = {
      content: [{ type: "Hero", props: { title: "My Store" } }],
    };

    const result = generateAstroPage(page, registry);

    expect(result).toContain('title="My Store"');
  });

  it("serializes boolean true as bare attribute", () => {
    const registry: Record<string, ComponentRegistryEntry> = {
      Hero: STATIC_HERO,
    };
    const page: PuckPageData = {
      content: [{ type: "Hero", props: { fullWidth: true } }],
    };

    const result = generateAstroPage(page, registry);

    expect(result).toContain("fullWidth");
    expect(result).not.toContain("fullWidth=");
  });

  it("serializes boolean false as expression attribute", () => {
    const registry: Record<string, ComponentRegistryEntry> = {
      Hero: STATIC_HERO,
    };
    const page: PuckPageData = {
      content: [{ type: "Hero", props: { showImage: false } }],
    };

    const result = generateAstroPage(page, registry);

    expect(result).toContain("showImage={false}");
  });

  it("serializes number props as expression attributes", () => {
    const registry: Record<string, ComponentRegistryEntry> = {
      Hero: STATIC_HERO,
    };
    const page: PuckPageData = {
      content: [{ type: "Hero", props: { columns: 3 } }],
    };

    const result = generateAstroPage(page, registry);

    expect(result).toContain("columns={3}");
  });

  it("serializes object/array props as JSON expressions", () => {
    const registry: Record<string, ComponentRegistryEntry> = {
      Hero: STATIC_HERO,
    };
    const page: PuckPageData = {
      content: [
        {
          type: "Hero",
          props: { links: [{ href: "/about", label: "About" }] },
        },
      ],
    };

    const result = generateAstroPage(page, registry);

    expect(result).toContain("links={");
    expect(result).toContain('"href":"/about"');
  });

  it("skips null and undefined props", () => {
    const registry: Record<string, ComponentRegistryEntry> = {
      Hero: STATIC_HERO,
    };
    const page: PuckPageData = {
      content: [
        { type: "Hero", props: { title: "Hi", subtitle: null, desc: undefined } },
      ],
    };

    const result = generateAstroPage(page, registry);

    expect(result).toContain('title="Hi"');
    expect(result).not.toContain("subtitle");
    expect(result).not.toContain("desc");
  });

  it("renders unknown components as HTML comments", () => {
    const page: PuckPageData = {
      content: [{ type: "UnknownWidget", props: {} }],
    };

    const result = generateAstroPage(page, {});

    expect(result).toContain("<!-- Unknown component: UnknownWidget -->");
  });

  it("wraps content in layout when layout options provided", () => {
    const registry: Record<string, ComponentRegistryEntry> = {
      Hero: STATIC_HERO,
    };
    const page: PuckPageData = {
      content: [{ type: "Hero", props: { title: "Test" } }],
    };

    const result = generateAstroPage(page, registry, {
      layoutImport: "../layouts/StoreLayout.astro",
      layoutTag: "StoreLayout",
    });

    expect(result).toContain(
      "import StoreLayout from '../layouts/StoreLayout.astro';",
    );
    expect(result).toContain("<StoreLayout>");
    expect(result).toContain("</StoreLayout>");
  });

  it("handles nested content (slots)", () => {
    const registry: Record<string, ComponentRegistryEntry> = {
      Section: {
        name: "Section",
        kind: "static",
        importPath: "../components/Section.astro",
      },
      Hero: STATIC_HERO,
    };
    const page: PuckPageData = {
      content: [
        {
          type: "Section",
          props: { id: "main" },
          content: [{ type: "Hero", props: { title: "Nested" } }],
        },
      ],
    };

    const result = generateAstroPage(page, registry);

    expect(result).toContain("<Section");
    expect(result).toContain("</Section>");
    expect(result).toContain("<Hero");
  });

  it("deduplicates imports for repeated component types", () => {
    const registry: Record<string, ComponentRegistryEntry> = {
      Hero: STATIC_HERO,
    };
    const page: PuckPageData = {
      content: [
        { type: "Hero", props: { title: "First" } },
        { type: "Hero", props: { title: "Second" } },
      ],
    };

    const result = generateAstroPage(page, registry);

    const importCount = (
      result.match(/import Hero from/g) || []
    ).length;
    expect(importCount).toBe(1);
  });

  it("generates self-closing tags for components without children", () => {
    const registry: Record<string, ComponentRegistryEntry> = {
      Hero: STATIC_HERO,
    };
    const page: PuckPageData = {
      content: [{ type: "Hero", props: { title: "Hi" } }],
    };

    const result = generateAstroPage(page, registry);

    expect(result).toMatch(/<Hero[^>]+ \/>/);
  });

  it("generates multiple components in order", () => {
    const registry: Record<string, ComponentRegistryEntry> = {
      Hero: STATIC_HERO,
      Footer: STATIC_FOOTER,
    };
    const page: PuckPageData = {
      content: [
        { type: "Hero", props: { title: "Hi" } },
        { type: "Footer", props: { copyright: "2024" } },
      ],
    };

    const result = generateAstroPage(page, registry);

    const heroIndex = result.indexOf("<Hero");
    const footerIndex = result.indexOf("<Footer");
    expect(heroIndex).toBeLessThan(footerIndex);
  });

  it("handles empty content array", () => {
    const result = generateAstroPage({ content: [] }, {});

    expect(result).toContain("---");
    // No component tags should appear
    expect(result).not.toContain("<Hero");
  });

  it("handles content with no props", () => {
    const registry: Record<string, ComponentRegistryEntry> = {
      Hero: STATIC_HERO,
    };
    const page: PuckPageData = {
      content: [{ type: "Hero" }],
    };

    const result = generateAstroPage(page, registry);

    expect(result).toContain("<Hero");
  });
});
