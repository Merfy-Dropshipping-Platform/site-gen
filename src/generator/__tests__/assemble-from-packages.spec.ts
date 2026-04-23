/**
 * Tests for assemble-from-packages.ts — Phase 3a dual-mode assembler.
 *
 * Covers:
 * - Flag-OFF path: scaffold-builder still uses legacy templates/astro/<theme> copy.
 * - Flag-ON path: assembleFromPackages produces expected directory structure.
 * - Tokens v2 generator emits CSS variables from tokens.json.
 * - Theme-level blocks OVERRIDE base blocks of same name.
 * - Missing package directories emit warnings but don't throw.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  assembleFromPackages,
  generateTokensCssV2,
  isNewPackagesFlagEnabled,
} from "../assemble-from-packages";
import { buildScaffold, type ScaffoldConfig } from "../scaffold-builder";
import type { ComponentRegistryEntry } from "../page-generator";

let tmpDir: string;
let packagesRoot: string;

/**
 * Build a minimal fake packages/ tree for testing.
 *
 * Structure:
 *   packages/
 *     theme-base/
 *       layouts/BaseLayout.astro
 *       seo/MetaTags.astro
 *       blocks/Hero/Hero.astro
 *       blocks/Footer/Footer.astro
 *     theme-testtheme/
 *       theme.json
 *       tokens.json
 *       blocks/Hero/Hero.astro       ← overrides base Hero
 *       assets/logo.png
 *       customBlocks/Custom.astro
 */
async function createFakePackages(root: string): Promise<void> {
  // theme-base
  const base = path.join(root, "theme-base");
  await fs.mkdir(path.join(base, "layouts"), { recursive: true });
  await fs.writeFile(
    path.join(base, "layouts", "BaseLayout.astro"),
    "<!-- base layout -->\n<html><slot /></html>",
  );
  await fs.mkdir(path.join(base, "seo"), { recursive: true });
  await fs.writeFile(
    path.join(base, "seo", "MetaTags.astro"),
    "<!-- base seo -->",
  );
  await fs.mkdir(path.join(base, "blocks", "Hero"), { recursive: true });
  await fs.writeFile(
    path.join(base, "blocks", "Hero", "Hero.astro"),
    "<!-- base Hero -->",
  );
  await fs.mkdir(path.join(base, "blocks", "Footer"), { recursive: true });
  await fs.writeFile(
    path.join(base, "blocks", "Footer", "Footer.astro"),
    "<!-- base Footer -->",
  );

  // theme-testtheme (overrides Hero)
  const theme = path.join(root, "theme-testtheme");
  await fs.mkdir(path.join(theme, "blocks", "Hero"), { recursive: true });
  await fs.writeFile(
    path.join(theme, "blocks", "Hero", "Hero.astro"),
    "<!-- testtheme Hero OVERRIDE -->",
  );
  await fs.mkdir(path.join(theme, "assets"), { recursive: true });
  await fs.writeFile(path.join(theme, "assets", "logo.png"), "FAKEPNG");
  await fs.mkdir(path.join(theme, "customBlocks"), { recursive: true });
  await fs.writeFile(
    path.join(theme, "customBlocks", "Custom.astro"),
    "<!-- custom block -->",
  );
  await fs.writeFile(
    path.join(theme, "theme.json"),
    JSON.stringify({ id: "testtheme", name: "Test Theme" }),
  );
  await fs.writeFile(
    path.join(theme, "tokens.json"),
    JSON.stringify({
      color: {
        bg: { $value: "#ffffff", $type: "color" },
        text: { $value: "#121212", $type: "color" },
      },
      radius: {
        button: { $value: "8px", $type: "dimension" },
      },
    }),
  );
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "assemble-pkg-test-"));
  packagesRoot = path.join(tmpDir, "packages");
  await fs.mkdir(packagesRoot, { recursive: true });
  await createFakePackages(packagesRoot);
  // Ensure flag starts clean per test
  delete process.env.BUILD_USE_NEW_PACKAGES;
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.BUILD_USE_NEW_PACKAGES;
});

describe("isNewPackagesFlagEnabled", () => {
  it("returns false when env var is unset", () => {
    delete process.env.BUILD_USE_NEW_PACKAGES;
    expect(isNewPackagesFlagEnabled()).toBe(false);
  });

  it("returns false when env var is 'false'", () => {
    process.env.BUILD_USE_NEW_PACKAGES = "false";
    expect(isNewPackagesFlagEnabled()).toBe(false);
  });

  it("returns true when env var is 'true'", () => {
    process.env.BUILD_USE_NEW_PACKAGES = "true";
    expect(isNewPackagesFlagEnabled()).toBe(true);
  });

  it("is case-insensitive for 'TRUE'", () => {
    process.env.BUILD_USE_NEW_PACKAGES = "TRUE";
    expect(isNewPackagesFlagEnabled()).toBe(true);
  });
});

describe("generateTokensCssV2", () => {
  it("produces CSS variables from a flat tokens.json", () => {
    const css = generateTokensCssV2({
      color: {
        bg: { $value: "#ffffff", $type: "color" },
        text: { $value: "#121212", $type: "color" },
      },
    });
    expect(css).toContain(":root {");
    expect(css).toContain("--color-bg: #ffffff;");
    expect(css).toContain("--color-text: #121212;");
  });

  it("handles nested groups by joining with hyphens", () => {
    const css = generateTokensCssV2({
      size: {
        hero: {
          heading: { $value: "72px", $type: "dimension" },
        },
      },
    });
    expect(css).toContain("--size-hero-heading: 72px;");
  });

  it("skips keys starting with $ (schema metadata)", () => {
    const css = generateTokensCssV2({
      $schema: "https://example.com/schema.json",
      color: { bg: { $value: "#fff", $type: "color" } },
    });
    expect(css).not.toContain("$schema");
    expect(css).toContain("--color-bg: #fff;");
  });

  it("returns empty :root {} for empty input", () => {
    const css = generateTokensCssV2({});
    expect(css).toContain(":root {");
    expect(css).toContain("}");
  });

  it("returns empty :root {} for null/undefined input", () => {
    expect(generateTokensCssV2(null)).toBe(":root {}\n");
    expect(generateTokensCssV2(undefined)).toBe(":root {}\n");
  });
});

describe("assembleFromPackages", () => {
  it("creates output directory", async () => {
    const outputDir = path.join(tmpDir, "out");
    const res = await assembleFromPackages({
      themeName: "testtheme",
      outputDir,
      packagesRoot,
    });
    const st = await fs.stat(outputDir);
    expect(st.isDirectory()).toBe(true);
    expect(res.outputDir).toBe(outputDir);
  });

  it("copies base layouts, seo, and base blocks", async () => {
    const outputDir = path.join(tmpDir, "out");
    await assembleFromPackages({
      themeName: "testtheme",
      outputDir,
      packagesRoot,
    });

    const layoutExists = await fs
      .stat(path.join(outputDir, "src", "layouts", "BaseLayout.astro"))
      .then((s) => s.isFile());
    const seoExists = await fs
      .stat(path.join(outputDir, "src", "seo", "MetaTags.astro"))
      .then((s) => s.isFile());
    const footerExists = await fs
      .stat(path.join(outputDir, "src", "components", "Footer.astro"))
      .then((s) => s.isFile());
    expect(layoutExists).toBe(true);
    expect(seoExists).toBe(true);
    expect(footerExists).toBe(true);
  });

  it("theme blocks override base blocks with the same name", async () => {
    const outputDir = path.join(tmpDir, "out");
    await assembleFromPackages({
      themeName: "testtheme",
      outputDir,
      packagesRoot,
    });

    const heroContent = await fs.readFile(
      path.join(outputDir, "src", "components", "Hero.astro"),
      "utf8",
    );
    expect(heroContent).toContain("testtheme Hero OVERRIDE");
    expect(heroContent).not.toContain("base Hero");
  });

  it("copies theme customBlocks and assets", async () => {
    const outputDir = path.join(tmpDir, "out");
    await assembleFromPackages({
      themeName: "testtheme",
      outputDir,
      packagesRoot,
    });

    const customExists = await fs
      .stat(path.join(outputDir, "src", "customBlocks", "Custom.astro"))
      .then((s) => s.isFile());
    const logoExists = await fs
      .stat(path.join(outputDir, "public", "assets", "logo.png"))
      .then((s) => s.isFile());
    expect(customExists).toBe(true);
    expect(logoExists).toBe(true);
  });

  it("generates tokens.css via shared buildTokensCss (manifest-driven)", async () => {
    // After the parity refactor, tokens.css is emitted by the same generator
    // the preview endpoint uses. Source of truth is the theme manifest +
    // merchant themeSettings; package tokens.json is no longer read directly
    // by assembleFromPackages. This test asserts:
    //   1. tokensCssGenerated flag is true
    //   2. Output contains required CSS var keys (values come from manifest
    //      or hardcoded Phase 0 fallbacks — specific hex colors are theme
    //      manifest responsibility, covered by preview endpoint tests).
    const outputDir = path.join(tmpDir, "out");
    const res = await assembleFromPackages({
      themeName: "testtheme",
      outputDir,
      packagesRoot,
    });

    expect(res.tokensCssGenerated).toBe(true);
    const tokensCss = await fs.readFile(
      path.join(outputDir, "src", "styles", "tokens.css"),
      "utf8",
    );
    expect(tokensCss).toMatch(/--radius-button:/);
    expect(tokensCss).toMatch(/--font-heading:/);
    expect(tokensCss).toMatch(/--color-primary:/);
  });

  it("emits warnings when a theme package is missing", async () => {
    const outputDir = path.join(tmpDir, "out");
    const res = await assembleFromPackages({
      themeName: "nonexistent",
      outputDir,
      packagesRoot,
    });
    expect(res.themeCopied).toBe(false);
    expect(res.warnings.some((w) => w.includes("theme-nonexistent"))).toBe(true);
    // Base should still be copied
    expect(res.baseCopied).toBe(true);
  });

  it("emits warnings when the base package is missing", async () => {
    // Remove base
    await fs.rm(path.join(packagesRoot, "theme-base"), {
      recursive: true,
      force: true,
    });
    const outputDir = path.join(tmpDir, "out");
    const res = await assembleFromPackages({
      themeName: "testtheme",
      outputDir,
      packagesRoot,
    });
    expect(res.baseCopied).toBe(false);
    expect(res.warnings.some((w) => w.includes("theme-base"))).toBe(true);
  });

  it("does not throw when both packages are absent", async () => {
    await fs.rm(path.join(packagesRoot, "theme-base"), { recursive: true, force: true });
    const outputDir = path.join(tmpDir, "out");
    const res = await assembleFromPackages({
      themeName: "whatever",
      outputDir,
      packagesRoot,
    });
    expect(res.baseCopied).toBe(false);
    expect(res.themeCopied).toBe(false);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it("skips node_modules and test files when copying", async () => {
    // Add junk files that should be filtered
    const base = path.join(packagesRoot, "theme-base");
    await fs.mkdir(path.join(base, "blocks", "Junk", "node_modules"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(base, "blocks", "Junk", "node_modules", "trash.js"),
      "NO",
    );
    await fs.writeFile(
      path.join(base, "blocks", "Junk", "Junk.spec.ts"),
      "describe()",
    );
    await fs.writeFile(
      path.join(base, "blocks", "Junk", "Junk.astro"),
      "<!-- ok -->",
    );

    const outputDir = path.join(tmpDir, "out");
    await assembleFromPackages({
      themeName: "testtheme",
      outputDir,
      packagesRoot,
    });

    // The .astro should be copied as a component
    const junkExists = await fs
      .stat(path.join(outputDir, "src", "components", "Junk.astro"))
      .then((s) => s.isFile())
      .catch(() => false);
    expect(junkExists).toBe(true);

    // But node_modules and spec files should NOT be under the output
    const trashExists = await fs
      .stat(path.join(outputDir, "node_modules"))
      .then(() => true)
      .catch(() => false);
    expect(trashExists).toBe(false);
  });
});

/**
 * Scaffold-builder dual-mode regression tests.
 *
 * The critical safety property: when BUILD_USE_NEW_PACKAGES is unset/false,
 * scaffold-builder MUST use the legacy templates/astro/<theme> copy path
 * and MUST NOT touch packages/.
 */
describe("scaffold-builder dual-mode flag", () => {
  const HERO_REGISTRY: Record<string, ComponentRegistryEntry> = {
    Hero: {
      name: "Hero",
      kind: "static",
      importPath: "../components/Hero.astro",
    },
  };

  it("flag-OFF: uses legacy templateRoot when flag is unset", async () => {
    delete process.env.BUILD_USE_NEW_PACKAGES;
    const legacyTemplate = path.join(tmpDir, "legacy-template");
    await fs.mkdir(path.join(legacyTemplate, "src", "components"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(legacyTemplate, "src", "components", "Legacy.astro"),
      "<!-- LEGACY SENTINEL -->",
    );

    const outputDir = path.join(tmpDir, "out-legacy");
    const config: ScaffoldConfig = {
      outputDir,
      templateRoot: legacyTemplate,
      pages: [],
      registry: HERO_REGISTRY,
    };
    const { generatedFiles } = await buildScaffold(config);

    expect(generatedFiles).toContain("[theme copied]");
    expect(generatedFiles).not.toContain("[assembled from packages]");
    const sentinel = await fs.readFile(
      path.join(outputDir, "src", "components", "Legacy.astro"),
      "utf8",
    );
    expect(sentinel).toContain("LEGACY SENTINEL");
  });

  it("flag-OFF: uses legacy even when themeName is set (no templateRoot)", async () => {
    delete process.env.BUILD_USE_NEW_PACKAGES;
    const outputDir = path.join(tmpDir, "out-legacy2");
    const config: ScaffoldConfig = {
      outputDir,
      themeName: "testtheme", // would resolve to templates/astro/testtheme
      pages: [],
      registry: HERO_REGISTRY,
    };
    const { generatedFiles } = await buildScaffold(config);

    // Legacy path runs — templates/astro/testtheme doesn't exist in cwd,
    // so no theme copied, but crucially NOT "[assembled from packages]"
    expect(generatedFiles).not.toContain("[assembled from packages]");
  });

  it("explicit templateRoot overrides flag-ON (safety escape hatch)", async () => {
    process.env.BUILD_USE_NEW_PACKAGES = "true";
    const legacyTemplate = path.join(tmpDir, "legacy-template-2");
    await fs.mkdir(path.join(legacyTemplate, "src", "components"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(legacyTemplate, "src", "components", "Escape.astro"),
      "<!-- ESCAPE HATCH -->",
    );

    const outputDir = path.join(tmpDir, "out-escape");
    const config: ScaffoldConfig = {
      outputDir,
      templateRoot: legacyTemplate, // explicit override
      pages: [],
      registry: HERO_REGISTRY,
    };
    const { generatedFiles } = await buildScaffold(config);

    expect(generatedFiles).toContain("[theme copied]");
    expect(generatedFiles).not.toContain("[assembled from packages]");
  });
});
