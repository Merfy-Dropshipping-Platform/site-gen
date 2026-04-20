import fs from 'node:fs/promises';
import path from 'node:path';

export interface ValidateBlockResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const RGB_RE = /\brgba?\(\s*\d/;
const HSL_RE = /\bhsla?\(\s*\d/;

export async function validateBlock(blockDir: string): Promise<ValidateBlockResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Derive component name from files inside the directory.
  // Look for a *.puckConfig.ts file — its prefix is the component name.
  // Fall back to any *.astro, *.classes.ts, or *.tokens.ts; finally to dir basename.
  let entries: string[] = [];
  try {
    entries = await fs.readdir(blockDir);
  } catch {
    errors.push(`Cannot read block directory: ${blockDir}`);
    return { ok: false, errors, warnings };
  }

  const componentName = deriveComponentName(entries, path.basename(blockDir));

  // B-1: 5 mandatory files exist
  const required = [
    `${componentName}.puckConfig.ts`,
    `${componentName}.tokens.ts`,
    `${componentName}.classes.ts`,
    `${componentName}.astro`,
    'index.ts',
  ];
  for (const f of required) {
    try {
      await fs.access(path.join(blockDir, f));
    } catch {
      errors.push(`Missing required file: ${f}`);
    }
  }

  // B-10: no .tsx files
  const tsxFiles = entries.filter(e => e.endsWith('.tsx'));
  if (tsxFiles.length > 0) {
    errors.push(`Forbidden .tsx file(s): ${tsxFiles.join(', ')}. Renderer is Astro-only.`);
  }

  // B-6: no hex / rgb / hsl in .astro and .classes.ts
  for (const f of [`${componentName}.astro`, `${componentName}.classes.ts`]) {
    const fp = path.join(blockDir, f);
    try {
      const content = await fs.readFile(fp, 'utf-8');
      const body = f.endsWith('.astro') ? stripAstroFrontmatter(content) : content;
      if (HEX_RE.test(body)) {
        errors.push(`Hex color literal found in ${f}. Use rgb(var(--color-*)) instead.`);
      }
      if (RGB_RE.test(body)) {
        const hasRawRgb = body.split('\n').some(
          line => RGB_RE.test(line) && !/rgb\(\s*var\(/.test(line)
        );
        if (hasRawRgb) {
          errors.push(`Raw rgb() with numbers found in ${f}. Use rgb(var(--color-*)) instead.`);
        }
      }
      if (HSL_RE.test(body)) {
        errors.push(`Raw hsl() with numbers found in ${f}.`);
      }
    } catch {
      // file missing already reported above
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function stripAstroFrontmatter(content: string): string {
  const m = content.match(/^---[\s\S]*?---\n([\s\S]*)$/);
  return m ? m[1] : content;
}

function deriveComponentName(entries: string[], dirBasename: string): string {
  // Prefer *.puckConfig.ts → prefix is canonical component name
  const puck = entries.find(e => e.endsWith('.puckConfig.ts'));
  if (puck) return puck.replace(/\.puckConfig\.ts$/, '');

  // Fall back to other convention files
  const astro = entries.find(e => e.endsWith('.astro'));
  if (astro) return astro.replace(/\.astro$/, '');

  const classes = entries.find(e => e.endsWith('.classes.ts'));
  if (classes) return classes.replace(/\.classes\.ts$/, '');

  const tokens = entries.find(e => e.endsWith('.tokens.ts'));
  if (tokens) return tokens.replace(/\.tokens\.ts$/, '');

  // Last resort: directory basename
  return dirBasename;
}
