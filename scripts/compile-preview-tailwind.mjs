#!/usr/bin/env node
/**
 * Compile the Tailwind CSS bundle injected into preview iframes.
 *
 * Runs once per Docker build (see Dockerfile) and writes the result to
 * `dist/preview-tailwind.css` so PreviewService can read it at runtime
 * without pulling Tailwind into the Node process.
 *
 * Uses the same input that live build uses — one source of truth для
 * "the CSS theme-base blocks render against". Tailwind v4 синтаксис:
 * config через `@source` directives в tailwind-input.css, не JS config.
 *
 * Pipeline:
 *   1. Locate Tailwind v4 CLI (`@tailwindcss/cli`) via `createRequire`.
 *   2. Invoke с input (`@import "tailwindcss"; @source ...`).
 *   3. Emit minified CSS в dist/.
 *
 * Site ≡ constructor parity invariant: preview compile должен использовать
 * ТУ ЖЕ Tailwind версию что и Astro live build (templates/astro/<theme>
 * package.json → tailwindcss ^4). Иначе cascade расходится (например,
 * v3 emit longhand .mx-auto, v4 — logical shorthand → разное поведение
 * после reset `* { margin: 0 }`).
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
const INPUT = path.join(SNAPSHOTS_DIR, 'tailwind-input.css');
const OUT_DIR = path.join(SITES_ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'preview-tailwind.css');

mkdirSync(OUT_DIR, { recursive: true });

// Tailwind v4 CLI lives в `@tailwindcss/cli` отдельный пакет. Resolve через
// package.json `bin` map (exports не разрешает прямой `./dist/index.mjs`).
const cliPkgPath = requireFromHere.resolve('@tailwindcss/cli/package.json');
const cli = path.join(path.dirname(cliPkgPath), 'dist', 'index.mjs');

// `@source` paths in tailwind-input.css resolved relative to input file's
// dir, but cwd ещё важен для других resolution. Run from theme-base root
// чтобы matched paths (./blocks, ../theme-rose, etc.) указывали правильно.
execFileSync(
  process.execPath,
  [cli, '-i', INPUT, '-o', OUT, '--minify'],
  { stdio: 'inherit', cwd: path.join(SNAPSHOTS_DIR, '..') },
);

console.log(`✓ preview-tailwind.css → ${OUT}`);
