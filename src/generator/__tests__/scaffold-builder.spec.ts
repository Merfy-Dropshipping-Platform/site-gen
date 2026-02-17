/**
 * Tests for scaffold-builder.ts
 *
 * Validates:
 * - Astro project scaffolding from theme + Puck JSON
 * - Theme directory copying
 * - package.json, astro.config, tailwind.config generation
 * - Page generation from Puck JSON
 * - Dynamic page generation
 * - Override CSS tokens generation
 * - Build-time data writing
 * - Extra files writing
 * - Existing config files are not overwritten
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { buildScaffold, type ScaffoldConfig } from "../scaffold-builder";
import type { ComponentRegistryEntry } from "../page-generator";

let tmpDir: string;
let templateDir: string;

// Create a minimal theme template for testing
async function createMinimalTheme(dir: string): Promise<void> {
  await fs.mkdir(path.join(dir, "src", "layouts"), { recursive: true });
  await fs.mkdir(path.join(dir, "src", "components"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "src", "layouts", "BaseLayout.astro"),
    "<html><slot /></html>",
  );
  await fs.writeFile(
    path.join(dir, "src", "components", "Hero.astro"),
    "<section>{Astro.props.title}</section>",
  );
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "scaffold-test-"));
  templateDir = path.join(tmpDir, "template");
  await createMinimalTheme(templateDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const HERO_REGISTRY: Record<string, ComponentRegistryEntry> = {
  Hero: {
    name: "Hero",
    kind: "static",
    importPath: "../components/Hero.astro",
  },
};

describe("buildScaffold", () => {
  it("creates output directory", async () => {
    const outputDir = path.join(tmpDir, "output");
    const config: ScaffoldConfig = {
      outputDir,
      templateRoot: templateDir,
      pages: [],
      registry: {},
    };

    await buildScaffold(config);

    const stat = await fs.stat(outputDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("copies theme files from template directory", async () => {
    const outputDir = path.join(tmpDir, "output");
    const config: ScaffoldConfig = {
      outputDir,
      templateRoot: templateDir,
      pages: [],
      registry: {},
    };

    const { generatedFiles } = await buildScaffold(config);

    // Theme should be copied
    expect(generatedFiles).toContain("[theme copied]");
    // BaseLayout.astro should exist in output
    const layoutPath = path.join(outputDir, "src", "layouts", "BaseLayout.astro");
    const layoutContent = await fs.readFile(layoutPath, "utf8");
    expect(layoutContent).toContain("<html>");
  });

  it("generates package.json when theme does not provide one", async () => {
    const outputDir = path.join(tmpDir, "output");
    const config: ScaffoldConfig = {
      outputDir,
      templateRoot: templateDir,
      pages: [],
      registry: {},
    };

    const { generatedFiles } = await buildScaffold(config);

    expect(generatedFiles).toContain("package.json");
    const pkgJson = JSON.parse(
      await fs.readFile(path.join(outputDir, "package.json"), "utf8"),
    );
    expect(pkgJson.dependencies).toBeDefined();
    expect(pkgJson.dependencies.astro).toBeDefined();
  });

  it("does not overwrite package.json from theme", async () => {
    // Pre-write package.json to template
    const themePkg = { name: "theme-pkg", version: "1.0.0" };
    await fs.writeFile(
      path.join(templateDir, "package.json"),
      JSON.stringify(themePkg),
    );

    const outputDir = path.join(tmpDir, "output");
    const config: ScaffoldConfig = {
      outputDir,
      templateRoot: templateDir,
      pages: [],
      registry: {},
    };

    const { generatedFiles } = await buildScaffold(config);

    // Should NOT generate a new package.json (theme provides one)
    expect(generatedFiles).not.toContain("package.json");
    const pkgContent = JSON.parse(
      await fs.readFile(path.join(outputDir, "package.json"), "utf8"),
    );
    expect(pkgContent.name).toBe("theme-pkg");
  });

  it("generates astro.config.ts when not present", async () => {
    const outputDir = path.join(tmpDir, "output");
    const config: ScaffoldConfig = {
      outputDir,
      templateRoot: templateDir,
      pages: [],
      registry: {},
    };

    const { generatedFiles } = await buildScaffold(config);

    expect(generatedFiles).toContain("astro.config.ts");
    const configContent = await fs.readFile(
      path.join(outputDir, "astro.config.ts"),
      "utf8",
    );
    expect(configContent).toContain("defineConfig");
  });

  it("does not overwrite astro.config.mjs from theme", async () => {
    await fs.writeFile(
      path.join(templateDir, "astro.config.mjs"),
      "// theme config",
    );

    const outputDir = path.join(tmpDir, "output");
    const config: ScaffoldConfig = {
      outputDir,
      templateRoot: templateDir,
      pages: [],
      registry: {},
    };

    const { generatedFiles } = await buildScaffold(config);

    expect(generatedFiles).not.toContain("astro.config.ts");
  });

  it("generates tailwind.config.ts when not present", async () => {
    const outputDir = path.join(tmpDir, "output");
    const config: ScaffoldConfig = {
      outputDir,
      templateRoot: templateDir,
      pages: [],
      registry: {},
    };

    const { generatedFiles } = await buildScaffold(config);

    expect(generatedFiles).toContain("tailwind.config.ts");
    const twContent = await fs.readFile(
      path.join(outputDir, "tailwind.config.ts"),
      "utf8",
    );
    expect(twContent).toContain("content:");
  });

  it("generates .astro pages from Puck JSON content", async () => {
    const outputDir = path.join(tmpDir, "output");
    const config: ScaffoldConfig = {
      outputDir,
      templateRoot: templateDir,
      pages: [
        {
          fileName: "index.astro",
          data: {
            content: [{ type: "Hero", props: { title: "Welcome" } }],
          },
        },
      ],
      registry: HERO_REGISTRY,
      layout: {
        importPath: "../layouts/BaseLayout.astro",
        tagName: "BaseLayout",
      },
    };

    const { generatedFiles } = await buildScaffold(config);

    expect(generatedFiles).toContain("src/pages/index.astro");
    const pageContent = await fs.readFile(
      path.join(outputDir, "src", "pages", "index.astro"),
      "utf8",
    );
    expect(pageContent).toContain("import Hero");
    expect(pageContent).toContain('title="Welcome"');
    expect(pageContent).toContain("<BaseLayout>");
  });

  it("generates multiple pages", async () => {
    const outputDir = path.join(tmpDir, "output");
    const config: ScaffoldConfig = {
      outputDir,
      templateRoot: templateDir,
      pages: [
        {
          fileName: "index.astro",
          data: { content: [{ type: "Hero", props: { title: "Home" } }] },
        },
        {
          fileName: "about.astro",
          data: { content: [{ type: "Hero", props: { title: "About" } }] },
        },
      ],
      registry: HERO_REGISTRY,
    };

    const { generatedFiles } = await buildScaffold(config);

    expect(generatedFiles).toContain("src/pages/index.astro");
    expect(generatedFiles).toContain("src/pages/about.astro");
  });

  it("generates dynamic product and collection pages", async () => {
    const outputDir = path.join(tmpDir, "output");
    const config: ScaffoldConfig = {
      outputDir,
      templateRoot: templateDir,
      pages: [],
      registry: {},
      dynamicPages: {
        apiUrl: "https://api.example.com",
        shopId: "shop-1",
      },
    };

    const { generatedFiles } = await buildScaffold(config);

    expect(generatedFiles).toContain("src/pages/products/[handle].astro");
    expect(generatedFiles).toContain("src/pages/collections/[handle].astro");

    const productPage = await fs.readFile(
      path.join(outputDir, "src", "pages", "products", "[handle].astro"),
      "utf8",
    );
    expect(productPage).toContain("getStaticPaths");
    expect(productPage).toContain("shop-1");
  });

  it("generates override.css tokens from merchant settings", async () => {
    const outputDir = path.join(tmpDir, "output");
    const config: ScaffoldConfig = {
      outputDir,
      templateRoot: templateDir,
      pages: [],
      registry: {},
      merchantSettings: {
        fontFamily: "Inter",
        borderRadius: 8,
      },
    };

    const { generatedFiles } = await buildScaffold(config);

    expect(generatedFiles).toContain("src/styles/override.css");
    const css = await fs.readFile(
      path.join(outputDir, "src", "styles", "override.css"),
      "utf8",
    );
    expect(css).toContain("--font-family: Inter;");
    expect(css).toContain("--border-radius: 8px;");
  });

  it("writes build-time data files", async () => {
    const outputDir = path.join(tmpDir, "output");
    const config: ScaffoldConfig = {
      outputDir,
      templateRoot: templateDir,
      pages: [],
      registry: {},
      buildData: {
        siteData: { title: "My Store", content: [] },
        products: [{ id: "p1", name: "Product 1" }],
      },
    };

    const { generatedFiles } = await buildScaffold(config);

    expect(generatedFiles).toContain("src/data/data.json");
    expect(generatedFiles).toContain("src/data/products.json");

    const dataJson = JSON.parse(
      await fs.readFile(path.join(outputDir, "src", "data", "data.json"), "utf8"),
    );
    expect(dataJson.title).toBe("My Store");

    const productsJson = JSON.parse(
      await fs.readFile(
        path.join(outputDir, "src", "data", "products.json"),
        "utf8",
      ),
    );
    expect(productsJson).toHaveLength(1);
    expect(productsJson[0].name).toBe("Product 1");
  });

  it("writes extra files", async () => {
    const outputDir = path.join(tmpDir, "output");
    const config: ScaffoldConfig = {
      outputDir,
      templateRoot: templateDir,
      pages: [],
      registry: {},
      extraFiles: {
        "src/data/site-config.json": '{"siteName":"Test"}',
      },
    };

    const { generatedFiles } = await buildScaffold(config);

    expect(generatedFiles).toContain("src/data/site-config.json");
    const extra = await fs.readFile(
      path.join(outputDir, "src", "data", "site-config.json"),
      "utf8",
    );
    expect(extra).toBe('{"siteName":"Test"}');
  });

  it("works without a template directory (no theme)", async () => {
    const outputDir = path.join(tmpDir, "output-no-theme");
    const config: ScaffoldConfig = {
      outputDir,
      templateRoot: path.join(tmpDir, "non-existent-theme"),
      pages: [
        {
          fileName: "index.astro",
          data: { content: [{ type: "Hero", props: { title: "Hi" } }] },
        },
      ],
      registry: HERO_REGISTRY,
    };

    const { generatedFiles } = await buildScaffold(config);

    // Should still generate package.json and pages
    expect(generatedFiles).toContain("package.json");
    expect(generatedFiles).toContain("src/pages/index.astro");
    expect(generatedFiles).not.toContain("[theme copied]");
  });

  it("returns list of all generated files", async () => {
    const outputDir = path.join(tmpDir, "output");
    const config: ScaffoldConfig = {
      outputDir,
      templateRoot: templateDir,
      pages: [
        {
          fileName: "index.astro",
          data: { content: [] },
        },
      ],
      registry: {},
      merchantSettings: { fontFamily: "Inter" },
      dynamicPages: { apiUrl: "https://api.test", shopId: "s1" },
    };

    const { generatedFiles } = await buildScaffold(config);

    expect(generatedFiles.length).toBeGreaterThanOrEqual(5);
    // Should contain theme marker, page, dynamic pages, tokens, configs
    expect(generatedFiles).toContain("[theme copied]");
    expect(generatedFiles).toContain("src/pages/index.astro");
    expect(generatedFiles).toContain("src/pages/products/[handle].astro");
    expect(generatedFiles).toContain("src/pages/collections/[handle].astro");
    expect(generatedFiles).toContain("src/styles/override.css");
  });
});
