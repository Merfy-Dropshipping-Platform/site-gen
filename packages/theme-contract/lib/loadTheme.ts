import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { ThemeManifest, ThemeExport, ComponentRegistryEntry } from '../types.js';

/**
 * Checks if a file or directory exists at the given path.
 */
async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads a JSON file and parses it.
 */
async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

/**
 * Discovers layout files in the layouts/ directory.
 * Returns a map of layout name -> lazy loader function.
 */
async function discoverLayouts(themeDir: string): Promise<Record<string, () => Promise<unknown>>> {
  const layoutsDir = path.join(themeDir, 'layouts');
  const layouts: Record<string, () => Promise<unknown>> = {};

  if (!(await exists(layoutsDir))) {
    return layouts;
  }

  const entries = await fs.readdir(layoutsDir);
  for (const entry of entries) {
    if (entry.endsWith('.astro')) {
      const name = path.basename(entry, '.astro');
      const layoutPath = path.join(layoutsDir, entry);
      layouts[name] = async () => {
        const content = await fs.readFile(layoutPath, 'utf-8');
        return { default: content, path: layoutPath };
      };
    }
  }

  return layouts;
}

/**
 * Creates lazy page loaders from the manifest's pages list.
 */
function createPageLoaders(
  themeDir: string,
  pages: string[],
): Record<string, () => Promise<unknown>> {
  const loaders: Record<string, () => Promise<unknown>> = {};

  for (const page of pages) {
    const pagePath = path.join(themeDir, 'pages', `${page}.json`);
    loaders[page] = async () => {
      return readJson(pagePath);
    };
  }

  return loaders;
}

/**
 * Reads the component registry from the theme directory.
 * Looks for components/registry.json first, falls back to empty array.
 */
async function loadRegistry(themeDir: string): Promise<ComponentRegistryEntry[]> {
  const jsonPath = path.join(themeDir, 'components', 'registry.json');
  if (await exists(jsonPath)) {
    return readJson<ComponentRegistryEntry[]>(jsonPath);
  }

  // If registry.ts exists but no .json, return empty
  // (TS files need compilation, which is not done at load time)
  return [];
}

/**
 * Loads a theme from a directory and returns a ThemeExport object.
 *
 * Reads:
 * - theme.json -> manifest
 * - components/registry.json -> registry
 * - tokens.css -> tokens string
 * - layouts/*.astro -> lazy layout loaders
 * - pages/{page}.json -> lazy page loaders
 *
 * @param themePath - Absolute path to the theme directory
 * @returns ThemeExport with manifest, registry, tokens, layouts, and pages
 * @throws Error if theme directory doesn't exist or theme.json is missing
 */
export async function loadTheme(themePath: string): Promise<ThemeExport> {
  // Verify directory exists
  if (!(await exists(themePath))) {
    throw new Error(`Theme directory does not exist: ${themePath}`);
  }

  // Read manifest
  const manifestPath = path.join(themePath, 'theme.json');
  if (!(await exists(manifestPath))) {
    throw new Error(`Missing theme.json in ${themePath}`);
  }
  const manifest = await readJson<ThemeManifest>(manifestPath);

  // Read tokens
  let tokens = '';
  const tokensPath = path.join(themePath, 'tokens.css');
  if (await exists(tokensPath)) {
    tokens = await fs.readFile(tokensPath, 'utf-8');
  }

  // Load registry
  const registry = await loadRegistry(themePath);

  // Discover layouts
  const layouts = await discoverLayouts(themePath);

  // Create page loaders
  const pages = createPageLoaders(themePath, manifest.pages ?? []);

  return {
    manifest,
    registry,
    tokens,
    layouts,
    pages,
  };
}
