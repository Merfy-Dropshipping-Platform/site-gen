#!/usr/bin/env node
/**
 * Compile the Tailwind CSS bundle injected into preview iframes.
 *
 * Runs once per Docker build (see Dockerfile) and writes the result to
 * `dist/preview-tailwind.css` so PreviewService can read it at runtime
 * without pulling Tailwind into the Node process.
 *
 * Uses the same config + input that the visual-snapshot pipeline uses —
 * one source of truth for "the CSS theme-base blocks render against".
 *
 * Pipeline:
 *   1. Locate Tailwind v3 CLI via `createRequire` (pnpm hoists it to the
 *      super-repo, so plain `tailwindcss` on PATH may be missing).
 *   2. Invoke it with the snapshot config (scans blocks/layouts/seo) and
 *      input (`@tailwind base/components/utilities`).
 *   3. Emit minified CSS to dist/.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const requireFromHere = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = path.resolve(__dirname, '..');
const SNAPSHOTS_DIR = path.join(
  SITES_ROOT,
  'packages',
  'theme-base',
  '__snapshots__',
);
const CONFIG = path.join(SNAPSHOTS_DIR, 'tailwind.config.cjs');
const INPUT = path.join(SNAPSHOTS_DIR, 'tailwind-input.css');
const OUT_DIR = path.join(SITES_ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'preview-tailwind.css');

mkdirSync(OUT_DIR, { recursive: true });

const cli = requireFromHere.resolve('tailwindcss/lib/cli.js');

// Tailwind `content` paths in tailwind.config.cjs are relative to the CWD
// of the running process (not the config file). Run the CLI from the
// theme-base root so it scans the right directories — otherwise it sees
// no source files and emits only ~5 KB of base utilities.
execFileSync(
  process.execPath,
  [cli, '-c', CONFIG, '-i', INPUT, '-o', OUT, '--minify'],
  { stdio: 'inherit', cwd: path.join(SNAPSHOTS_DIR, '..') },
);

console.log(`✓ preview-tailwind.css → ${OUT}`);
