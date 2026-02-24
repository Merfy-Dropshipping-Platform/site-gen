/**
 * Scaffold Builder — assembles a complete Astro project directory.
 *
 * Combines:
 * - Theme files (layouts, components, assets) copied from templates/astro/<theme>
 * - Generated pages from page-generator (Puck JSON → .astro)
 * - Generated dynamic pages (products/[handle].astro, collections/[handle].astro)
 * - Generated tokens (override.css)
 * - package.json with all dependencies
 * - astro.config.ts with React + Tailwind integrations
 *
 * Output: a directory that can run `astro build` to produce static HTML.
 */

import * as fs from "fs/promises";
import * as path from "path";
import {
  generateAstroPage,
  type PuckPageData,
  type ComponentRegistryEntry,
} from "./page-generator";
import {
  generateTokensCss,
  type MerchantSettings,
  type ThemeDefaults,
} from "./tokens-generator";
import {
  generateProductPage,
  generateCollectionPage,
  type DynamicPageConfig,
} from "./dynamic-pages-generator";

/** A page to generate from Puck JSON data */
export interface PageEntry {
  /** Output file name relative to src/pages/ (e.g. "index.astro", "about.astro") */
  fileName: string;
  /** Puck JSON data for this page */
  data: PuckPageData;
}

/** Configuration for the scaffold builder */
export interface ScaffoldConfig {
  /** Output directory for the assembled Astro project */
  outputDir: string;
  /** Theme name — looks for templates/astro/<theme> directory */
  themeName?: string;
  /** Custom template root override (instead of templates/astro/<theme>) */
  templateRoot?: string;
  /** Pages to generate from Puck JSON */
  pages: PageEntry[];
  /** Component registry for page generation */
  registry: Record<string, ComponentRegistryEntry>;
  /** Merchant settings for token generation */
  merchantSettings?: MerchantSettings;
  /** Theme default tokens */
  themeDefaults?: ThemeDefaults;
  /** Build-time data written to src/data/ */
  buildData?: {
    /** data.json — site/page metadata and Puck content */
    siteData?: Record<string, unknown>;
    /** products.json — product list for the store */
    products?: unknown[];
  };
  /** Dynamic pages configuration */
  dynamicPages?: DynamicPageConfig;
  /** Layout configuration for generated pages */
  layout?: {
    importPath: string; // e.g. "../layouts/StoreLayout.astro"
    tagName: string; // e.g. "StoreLayout"
  };
  /** Additional raw files to write (path relative to outputDir → content) */
  extraFiles?: Record<string, string>;
  /** Islands (smart revalidation) configuration */
  islands?: {
    enabled: boolean;
    serverUrl: string;
    storeId: string;
  };
}

/**
 * Write a file, creating parent directories as needed.
 */
async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

/**
 * Recursively copy a directory.
 */
async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Check if a directory exists.
 */
async function dirExists(dir: string): Promise<boolean> {
  return fs
    .stat(dir)
    .then((st) => st.isDirectory())
    .catch(() => false);
}

/**
 * Generate package.json for the Astro project.
 */
function generatePackageJson(): string {
  return JSON.stringify(
    {
      name: "merfy-store",
      private: true,
      type: "module",
      version: "0.0.0",
      scripts: {
        dev: "astro dev",
        build: "astro build",
        preview: "astro preview",
      },
      dependencies: {
        astro: "^4.0.0",
        react: "^18.3.1",
        "react-dom": "^18.3.1",
        "@astrojs/react": "^3.0.0",
        "@astrojs/tailwind": "^5.0.0",
        tailwindcss: "^3.4.0",
        "@nanostores/react": "^0.7.0",
        nanostores: "^0.10.0",
      },
      devDependencies: {
        "@types/react": "^18.3.0",
        "@types/react-dom": "^18.3.0",
      },
    },
    null,
    2,
  );
}

/**
 * Generate astro.config.ts with React + Tailwind integrations.
 */
function generateAstroConfig(): string {
  return `import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [
    react(),
    tailwind(),
  ],
  output: 'static',
});
`;
}

/**
 * Generate a basic tailwind.config.ts if one isn't provided by the theme.
 */
function generateTailwindConfig(): string {
  return `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
`;
}

/**
 * Assemble a complete Astro project directory.
 *
 * Steps:
 * 1. Copy theme files (if theme directory exists)
 * 2. Generate package.json (if not from theme)
 * 3. Generate astro.config.ts (if not from theme)
 * 4. Generate tailwind.config.ts (if not from theme)
 * 5. Generate pages from Puck JSON
 * 6. Generate dynamic pages (products/collections)
 * 7. Generate override.css tokens
 * 8. Write build-time data (data.json, products.json)
 * 9. Write any extra files
 *
 * @returns Paths of generated files relative to outputDir
 */
export async function buildScaffold(
  config: ScaffoldConfig,
): Promise<{ generatedFiles: string[] }> {
  const { outputDir } = config;
  const generatedFiles: string[] = [];

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // 1. Copy theme files
  const templateRoot =
    config.templateRoot ??
    path.join(
      process.cwd(),
      "templates",
      "astro",
      config.themeName ?? "default",
    );
  const themeExists = await dirExists(templateRoot);
  if (themeExists) {
    await copyDir(templateRoot, outputDir);
    generatedFiles.push("[theme copied]");
  }

  // 1b. Inject islands meta tags and script into layout
  if (config.islands?.enabled) {
    const layoutCandidates = ["StoreLayout.astro", "BaseLayout.astro"];
    const layoutsDir = path.join(outputDir, "src", "layouts");
    for (const layoutName of layoutCandidates) {
      const layoutPath = path.join(layoutsDir, layoutName);
      if (await fileExists(layoutPath)) {
        let layoutContent = await fs.readFile(layoutPath, "utf8");
        const metaTags =
          `<meta name="merfy-islands-url" content="${config.islands.serverUrl}" />\n` +
          `    <meta name="merfy-store-id" content="${config.islands.storeId}" />`;
        const scriptTag = `<script src="${config.islands.serverUrl}/islands.js" defer><\/script>`;
        layoutContent = layoutContent.replace(
          "</head>",
          `    ${metaTags}\n  </head>`,
        );
        layoutContent = layoutContent.replace(
          "</body>",
          `    ${scriptTag}\n  </body>`,
        );
        await fs.writeFile(layoutPath, layoutContent, "utf8");
        generatedFiles.push(`src/layouts/${layoutName} [islands injected]`);
        break; // only inject into the first found layout
      }
    }
  }

  // 2. package.json — write only if not already from theme
  const pkgPath = path.join(outputDir, "package.json");
  if (!(await fileExists(pkgPath))) {
    await writeFile(pkgPath, generatePackageJson());
    generatedFiles.push("package.json");
  }

  // 3. astro.config.ts — write only if not already from theme
  // Check for both .ts and .mjs variants
  const astroConfigTs = path.join(outputDir, "astro.config.ts");
  const astroConfigMjs = path.join(outputDir, "astro.config.mjs");
  if (
    !(await fileExists(astroConfigTs)) &&
    !(await fileExists(astroConfigMjs))
  ) {
    await writeFile(astroConfigTs, generateAstroConfig());
    generatedFiles.push("astro.config.ts");
  }

  // 4. tailwind.config.ts — write only if not already from theme
  const twConfigTs = path.join(outputDir, "tailwind.config.ts");
  const twConfigMjs = path.join(outputDir, "tailwind.config.mjs");
  const twConfigJs = path.join(outputDir, "tailwind.config.js");
  if (
    !(await fileExists(twConfigTs)) &&
    !(await fileExists(twConfigMjs)) &&
    !(await fileExists(twConfigJs))
  ) {
    await writeFile(twConfigTs, generateTailwindConfig());
    generatedFiles.push("tailwind.config.ts");
  }

  // 5. Generate static pages from Puck JSON
  // Use "initial" as buildHash for server-island components so the Web Component
  // always fetches fresh data on first page load (fallback is skeleton HTML).
  const buildHash = config.islands?.enabled ? "initial" : undefined;
  for (const page of config.pages) {
    const pageContent = generateAstroPage(page.data, config.registry, {
      layoutImport: config.layout?.importPath,
      layoutTag: config.layout?.tagName,
      buildHash,
    });
    const pagePath = path.join(outputDir, "src", "pages", page.fileName);
    await writeFile(pagePath, pageContent);
    generatedFiles.push(`src/pages/${page.fileName}`);
  }

  // 6. Generate dynamic pages
  if (config.dynamicPages) {
    const productPage = generateProductPage({
      ...config.dynamicPages,
      layoutImport: config.layout?.importPath
        ? `../../layouts/${path.basename(config.layout.importPath)}`
        : undefined,
      layoutTag: config.layout?.tagName,
    });
    const productPagePath = path.join(
      outputDir,
      "src",
      "pages",
      "products",
      "[handle].astro",
    );
    await writeFile(productPagePath, productPage);
    generatedFiles.push("src/pages/products/[handle].astro");

    const collectionPage = generateCollectionPage({
      ...config.dynamicPages,
      layoutImport: config.layout?.importPath
        ? `../../layouts/${path.basename(config.layout.importPath)}`
        : undefined,
      layoutTag: config.layout?.tagName,
    });
    const collectionPagePath = path.join(
      outputDir,
      "src",
      "pages",
      "collections",
      "[handle].astro",
    );
    await writeFile(collectionPagePath, collectionPage);
    generatedFiles.push("src/pages/collections/[handle].astro");
  }

  // 7. Generate override.css tokens
  if (config.merchantSettings) {
    const tokensCss = generateTokensCss(
      config.merchantSettings,
      config.themeDefaults ?? {},
    );
    const tokensPath = path.join(outputDir, "src", "styles", "override.css");
    await writeFile(tokensPath, tokensCss);
    generatedFiles.push("src/styles/override.css");

    // Ensure global.css imports override.css so tokens take effect
    const globalCssPath = path.join(outputDir, "src", "styles", "global.css");
    try {
      let globalCss = await fs.readFile(globalCssPath, "utf8");
      if (!globalCss.includes("override.css")) {
        globalCss += '\n@import "./override.css";\n';
        await fs.writeFile(globalCssPath, globalCss, "utf8");
      }
    } catch {
      // global.css may not exist in all themes — skip silently
    }
  }

  // 8. Write build-time data
  if (config.buildData) {
    if (config.buildData.siteData) {
      const dataPath = path.join(outputDir, "src", "data", "data.json");
      await writeFile(
        dataPath,
        JSON.stringify(config.buildData.siteData, null, 2),
      );
      generatedFiles.push("src/data/data.json");
    }
    if (config.buildData.products) {
      const productsPath = path.join(outputDir, "src", "data", "products.json");
      await writeFile(
        productsPath,
        JSON.stringify(config.buildData.products, null, 2),
      );
      generatedFiles.push("src/data/products.json");

      // Also write to public/data/ for runtime access by checkout.js
      const publicProductsPath = path.join(outputDir, "public", "data", "products.json");
      await writeFile(
        publicProductsPath,
        JSON.stringify(config.buildData.products, null, 2),
      );
      generatedFiles.push("public/data/products.json");
    }
  }

  // 9. Write extra files
  if (config.extraFiles) {
    for (const [relPath, content] of Object.entries(config.extraFiles)) {
      const fullPath = path.join(outputDir, relPath);
      await writeFile(fullPath, content);
      generatedFiles.push(relPath);
    }
  }

  return { generatedFiles };
}

/**
 * Check if a file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
  return fs
    .stat(filePath)
    .then((st) => st.isFile())
    .catch(() => false);
}
