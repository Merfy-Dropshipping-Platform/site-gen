import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Registry, ValidationError, ValidationResult } from './types.js';

/**
 * Validate registry: проверяет contract что каждый block consistent
 * с filesystem. Errors блокируют startup/CI; warnings для информации.
 *
 * Checks:
 *  - MISSING_ASTRO: block has .puckConfig.ts но нет .astro renderer
 *  - BROKEN_IMPORT: relative import в .astro не resolvable
 *  - ORPHAN_OVERRIDE: theme-X имеет блок которого нет в theme-base
 */
export async function validateRegistry(
  registry: Registry,
  packagesDir: string,
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  for (const block of registry.blocks) {
    const hasPuckConfig = block.siblings.some((s) => s.includes('puckConfig'));
    if (!block.hasAstroRenderer && hasPuckConfig) {
      errors.push({
        code: 'MISSING_ASTRO',
        block: block.name,
        message: `Block имеет puckConfig но нет .astro renderer`,
        file: `theme-base/blocks/${block.name}/${block.name}.astro`,
      });
    }

    if (block.hasAstroRenderer) {
      const astroPath = path.join(
        packagesDir,
        'theme-base',
        'blocks',
        block.name,
        `${block.name}.astro`,
      );
      const src = await fs.readFile(astroPath, 'utf-8');
      const importMatches = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)];
      for (const m of importMatches) {
        const spec = m[1];
        // Skip package imports (no leading dot) and astro:* imports
        if (!spec.startsWith('.')) continue;
        if (spec.startsWith('astro:')) continue;

        const resolved = path.resolve(path.dirname(astroPath), spec);
        let found = false;
        for (const ext of ['', '.ts', '.astro', '.mjs', '.js', '/index.ts', '/index.mjs']) {
          try {
            await fs.access(resolved + ext);
            found = true;
            break;
          } catch {
            // try next ext
          }
        }
        if (!found) {
          errors.push({
            code: 'BROKEN_IMPORT',
            block: block.name,
            message: `Cannot resolve import '${spec}' from ${block.name}.astro`,
            file: astroPath,
          });
        }
      }
    }
  }

  // ORPHAN_OVERRIDE: theme-X имеет blocks/ entry without matching theme-base block
  const themes = await fs.readdir(packagesDir, { withFileTypes: true });
  for (const t of themes) {
    if (!t.isDirectory() || !t.name.startsWith('theme-') || t.name === 'theme-base') continue;
    const overrideBlocksDir = path.join(packagesDir, t.name, 'blocks');
    try {
      const overrideEntries = await fs.readdir(overrideBlocksDir, { withFileTypes: true });
      for (const e of overrideEntries) {
        if (!e.isDirectory()) continue;
        if (!registry.blocks.find((b) => b.name === e.name)) {
          warnings.push({
            code: 'ORPHAN_OVERRIDE',
            block: e.name,
            message: `Override exists в ${t.name} но нет base block '${e.name}'`,
            file: path.join(overrideBlocksDir, e.name),
          });
        }
      }
    } catch {
      // no blocks/ dir in this theme — OK
    }
  }

  return { errors, warnings };
}
