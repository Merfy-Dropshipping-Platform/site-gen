import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { validateTheme, type ValidationResult } from '../lib/validateTheme.js';

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
 * Runs theme validation and returns structured results with human-readable output.
 *
 * @param options - Validation options with theme name and themes directory
 * @returns Validation result with formatted output string
 * @throws Error if theme directory does not exist
 */
export async function runValidate(options: ValidateOptions): Promise<ValidateResult> {
  const { theme, themesDir } = options;
  const themeDir = path.join(themesDir, theme);

  // Verify theme directory exists
  try {
    await fs.access(themeDir);
  } catch {
    throw new Error(`Theme '${theme}' not found at ${themeDir}`);
  }

  const result = await validateTheme(themeDir);

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
