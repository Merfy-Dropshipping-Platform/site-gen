import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { validateTheme, type ValidationResult } from '../lib/validateTheme.js';
import { validateThemeV2 } from '../validators/validateTheme.v2.js';

/**
 * True when this CLI module is the process entry point (run directly, e.g.
 * `tsx packages/theme-contract/cli/validate.ts …` or the compiled
 * `cli/validate.js`) rather than merely imported (as by the jest suite).
 *
 * Cross-runtime constraint: inside this `"type": "module"` package the tsx ESM
 * runtime exposes neither `__filename` nor `require`, while ts-jest transpiles
 * to CommonJS where bare `import.meta` is a syntax error. The only signal
 * available and safe in BOTH runtimes is `process.argv[1]` (the absolute path
 * of the entry module). We therefore identify direct execution by matching the
 * entry's location — parent directory `cli` and basename `validate` (any of
 * the `.ts`/`.js`/… source extensions, or none) — which is unique to running
 * this file directly and never matches the jest/node binary that owns
 * `process.argv[1]` when the module is imported.
 */
function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (typeof entry !== 'string' || entry.length === 0) return false;
  const resolved = path.resolve(entry);
  const base = path.basename(resolved).replace(/\.(ts|mts|cts|js|mjs|cjs)$/i, '');
  const parent = path.basename(path.dirname(resolved));
  return parent === 'cli' && base === 'validate';
}

export interface ValidateOptions {
  theme: string;
  themesDir: string;
}

export interface ValidateResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  output: string;
}

/**
 * Detects whether `theme.json` in the given directory is a new-style
 * (package) manifest handled by {@link validateThemeV2}, as opposed to a
 * legacy theme directory handled by {@link validateTheme}.
 *
 * A new-style manifest is identified structurally (not by directory name): it
 * declares `extends: "@merfy/theme-base@…"`, a non-empty `colorSchemes` array
 * and a `defaults` token map — all required-and-unique to the v2
 * `ThemeManifestSchema` and absent from legacy manifests (which instead use
 * `pages` / `settings_schema` / a sibling `tokens.css`). Detection never
 * throws: any read/parse failure falls through to the legacy validator, which
 * emits its own precise diagnostics.
 *
 * @param themeDir - Path to the theme directory.
 * @returns `true` when the manifest should be validated by `validateThemeV2`.
 */
async function isNewStyleManifest(themeDir: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(path.join(themeDir, 'theme.json'), 'utf-8');
    const manifest = JSON.parse(raw) as Record<string, unknown>;
    const extendsField = manifest.extends;
    const hasBaseExtends =
      typeof extendsField === 'string' && /^@merfy\/theme-base@/.test(extendsField);
    const hasColorSchemes =
      Array.isArray(manifest.colorSchemes) && manifest.colorSchemes.length > 0;
    const hasDefaults =
      typeof manifest.defaults === 'object' && manifest.defaults !== null;
    return hasBaseExtends && hasColorSchemes && hasDefaults;
  } catch {
    return false;
  }
}

/**
 * Resolves the on-disk directory for a theme id under `themesDir`, supporting
 * both layouts: the legacy `<themesDir>/<theme>` (e.g. `themes/rose`) and the
 * package layout `<themesDir>/theme-<theme>` (e.g. `packages/theme-bloom`).
 * The bare `<theme>` form is preferred when both exist to preserve legacy
 * behaviour.
 *
 * @param themesDir - Directory that contains theme directories.
 * @param theme - Theme id (without the `theme-` prefix).
 * @returns The first existing candidate directory.
 * @throws Error listing the tried paths when no candidate exists.
 */
async function resolveThemeDir(themesDir: string, theme: string): Promise<string> {
  const candidates = [
    path.join(themesDir, theme),
    path.join(themesDir, `theme-${theme}`),
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  throw new Error(`Theme '${theme}' not found at ${candidates.join(' or ')}`);
}

/**
 * Runs theme validation and returns structured results with human-readable output.
 *
 * New-style `packages/theme-<id>` manifests are delegated to
 * {@link validateThemeV2} (the package-local source of truth); legacy theme
 * directories keep using {@link validateTheme}.
 *
 * @param options - Validation options with theme name and themes directory
 * @returns Validation result with formatted output string
 * @throws Error if the theme directory does not exist in either layout
 */
export async function runValidate(options: ValidateOptions): Promise<ValidateResult> {
  const { theme, themesDir } = options;
  const themeDir = await resolveThemeDir(themesDir, theme);

  let result: ValidationResult;
  if (await isNewStyleManifest(themeDir)) {
    const v2 = await validateThemeV2(themeDir);
    result = { valid: v2.ok, errors: v2.errors, warnings: v2.warnings };
  } else {
    result = await validateTheme(themeDir);
  }

  // Build human-readable output
  const outputLines: string[] = [];
  outputLines.push(`\nValidating theme: ${theme}`);
  outputLines.push('='.repeat(40));

  if (result.valid) {
    outputLines.push('Theme is valid');
  } else {
    outputLines.push('Theme validation failed:');
    outputLines.push('');
    for (const error of result.errors) {
      outputLines.push(`  ${error}`);
    }
  }

  if (result.warnings.length > 0) {
    outputLines.push('');
    outputLines.push('Warnings:');
    for (const warning of result.warnings) {
      outputLines.push(`  ${warning}`);
    }
  }

  outputLines.push('');

  return {
    valid: result.valid,
    errors: result.errors,
    warnings: result.warnings,
    output: outputLines.join('\n'),
  };
}

/**
 * CLI entry point for theme:validate command.
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  let theme = '';
  let themesDir = path.resolve('themes');

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--theme':
        theme = argv[++i];
        break;
      case '--themes-dir':
        themesDir = path.resolve(argv[++i]);
        break;
    }
  }

  if (!theme) {
    console.error('Usage: theme:validate --theme <name> [--themes-dir <dir>]');
    process.exit(1);
  }

  try {
    const result = await runValidate({ theme, themesDir });
    console.log(result.output);
    process.exit(result.valid ? 0 : 1);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

// Direct-execution guard: when this file is run as the entry module
// (e.g. `tsx cli/validate.ts …`) actually invoke main(). Without this the
// file only *exported* main(), so the package `theme:validate` script and the
// root `theme:validate:bloom` script performed no validation at all.
if (isDirectExecution()) {
  void main();
}
