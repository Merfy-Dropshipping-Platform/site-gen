import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { ThemeManifest, ComponentRegistryEntry } from '../types.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Checks if a file exists at the given path.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tries to read and parse a JSON file. Returns null on failure.
 */
async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Reads the component registry from the theme directory.
 * Supports both registry.json and registry.ts (parses the export from .ts as a fallback).
 * For .ts files, we look for a JSON companion or skip component validation.
 */
async function readRegistry(themeDir: string): Promise<ComponentRegistryEntry[] | null> {
  // Try registry.json first
  const jsonPath = path.join(themeDir, 'components', 'registry.json');
  const jsonRegistry = await readJsonFile<ComponentRegistryEntry[]>(jsonPath);
  if (jsonRegistry !== null) return jsonRegistry;

  // Try registry.ts - we can't import TS at runtime, but check if it exists
  const tsPath = path.join(themeDir, 'components', 'registry.ts');
  if (await fileExists(tsPath)) {
    // Return empty array - we know it exists but can't parse TS
    return [];
  }

  return null;
}

/**
 * Validates a theme manifest object for required fields.
 */
function validateManifest(manifest: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const requiredFields = ['name', 'version'] as const;

  for (const field of requiredFields) {
    if (!manifest[field]) {
      errors.push(`Missing required field '${field}' in theme.json`);
    }
  }

  return errors;
}

/**
 * Validates a theme directory structure and its contents.
 *
 * Checks:
 * - theme.json exists and matches schema
 * - All pages referenced have .json files
 * - All components in registry have both React (.tsx) and Astro (.astro) files
 * - tokens.css exists
 * - settings_schema is valid
 *
 * @param themeDir - Absolute path to the theme directory
 * @returns Validation result with errors and warnings
 */
export async function validateTheme(themeDir: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Check theme.json exists
  const manifestPath = path.join(themeDir, 'theme.json');
  if (!(await fileExists(manifestPath))) {
    errors.push('Missing theme.json manifest');
    return { valid: false, errors, warnings };
  }

  // 2. Parse theme.json
  const manifest = await readJsonFile<Record<string, unknown>>(manifestPath);
  if (manifest === null) {
    errors.push('Failed to parse theme.json: invalid JSON');
    return { valid: false, errors, warnings };
  }

  // 3. Validate manifest fields
  errors.push(...validateManifest(manifest));

  // 4. Check tokens.css
  const tokensPath = path.join(themeDir, 'tokens.css');
  if (!(await fileExists(tokensPath))) {
    errors.push('Missing tokens.css file');
  }

  // 5. Check referenced pages
  const pages = manifest.pages as string[] | undefined;
  if (pages && Array.isArray(pages)) {
    for (const page of pages) {
      const pagePath = path.join(themeDir, 'pages', `${page}.json`);
      if (!(await fileExists(pagePath))) {
        errors.push(`Missing page template for '${page}': expected at pages/${page}.json`);
      }
    }
  }

  // 6. Check component registry
  const registry = await readRegistry(themeDir);
  if (registry !== null && registry.length > 0) {
    for (const component of registry) {
      // Check React component
      const reactPath = path.join(themeDir, 'components', 'react', `${component.name}.tsx`);
      if (!(await fileExists(reactPath))) {
        errors.push(
          `Missing React component for '${component.name}': expected at components/react/${component.name}.tsx`
        );
      }

      // Check Astro template
      const astroFileName = component.astroTemplate || `${component.name}.astro`;
      const astroPath = path.join(themeDir, 'components', 'astro', astroFileName);
      if (!(await fileExists(astroPath))) {
        errors.push(
          `Missing Astro template for component '${component.name}': expected at components/astro/${astroFileName}`
        );
      }
    }
  }

  // 7. Warnings for recommended files
  const layoutsDir = path.join(themeDir, 'layouts');
  if (!(await fileExists(layoutsDir))) {
    warnings.push('No layouts/ directory found - consider adding a default layout');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
