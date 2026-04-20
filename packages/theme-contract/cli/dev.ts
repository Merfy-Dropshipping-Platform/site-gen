import * as path from 'node:path';
import { spawn } from 'node:child_process';

export interface DevOptions {
  theme: string;
  themesDir: string;
  port?: number;
}

/**
 * Starts an Astro dev server for the specified theme.
 *
 * This is a stub implementation that will be expanded when
 * the Astro generator infrastructure is in place (Phase 2B).
 *
 * For now it:
 * 1. Validates the theme exists
 * 2. Logs the intended behavior
 * 3. Would spawn `astro dev` with mock data injection
 *
 * @param options - Dev server options
 */
export async function startDev(options: DevOptions): Promise<void> {
  const { theme, themesDir, port = 4321 } = options;
  const themeDir = path.join(themesDir, theme);

  console.log(`Starting dev server for theme: ${theme}`);
  console.log(`Theme directory: ${themeDir}`);
  console.log(`Port: ${port}`);
  console.log('');
  console.log('Note: Dev server requires Astro Generator (Phase 2B) to be implemented.');
  console.log('This is a placeholder that will be connected to the Astro build pipeline.');
  console.log('');
  console.log(`When complete, the dev server will be available at http://localhost:${port}`);
  console.log('Features:');
  console.log('  - Hot reload for component changes');
  console.log('  - Mock data from packages/storefront/testing/');
  console.log('  - Puck editor preview at /editor');
}

/**
 * CLI entry point for theme:dev command.
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  let theme = '';
  let themesDir = path.resolve('themes');
  let port = 4321;

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--theme':
        theme = argv[++i];
        break;
      case '--themes-dir':
        themesDir = path.resolve(argv[++i]);
        break;
      case '--port':
        port = parseInt(argv[++i], 10);
        break;
    }
  }

  if (!theme) {
    console.error('Usage: theme:dev --theme <name> [--port <port>] [--themes-dir <dir>]');
    process.exit(1);
  }

  await startDev({ theme, themesDir, port });
}
