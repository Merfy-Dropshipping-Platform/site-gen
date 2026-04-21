/**
 * Snapshot render utility for @merfy/theme-rose. Mirrors the theme-base
 * implementation but accepts a `source` parameter so a single test file can
 * render either the rose override (`theme-rose__<Block>__<Block>.mjs`) or the
 * base block (`theme-base__<Block>__<Block>.mjs`) — rose reuses most base
 * blocks unchanged and only overrides a subset (Header, Footer).
 *
 * Pairs with precompiled blocks under `dist/astro-blocks/` (see
 * `scripts/compile-astro-blocks.mjs`). Run `pnpm build:blocks` in the sites
 * service before invoking `test:visual`.
 *
 * Tailwind CSS is compiled once per test run and cached to
 * `__snapshots__/tailwind-compiled.css` (gitignored). The config here scans
 * both rose-override and theme-base content paths so utility classes from
 * both packages end up in the compiled bundle.
 */
import { createServer, type Server } from 'node:http';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

// Works under both ESM and CJS — Playwright may transpile this file either
// way depending on version / config. Node 20+ always exposes createRequire.
const requireFromHere = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __snapshots__/ → theme-rose/ → packages/ → sites/
const DIST = path.resolve(__dirname, '../../../dist/astro-blocks');
const SNAPSHOTS_DIR = __dirname;
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const TAILWIND_CONFIG = path.join(SNAPSHOTS_DIR, 'tailwind.config.cjs');
const TAILWIND_INPUT = path.join(SNAPSHOTS_DIR, 'tailwind-input.css');
const TAILWIND_OUTPUT = path.join(SNAPSHOTS_DIR, 'tailwind-compiled.css');

export type BlockSource = 'base' | 'rose';

export interface SnapshotServer {
  url: string;
  stop: () => Promise<void>;
}

let cachedTailwindCss: string | null = null;

/**
 * Compile (or reuse) the Tailwind CSS bundle used by every rose visual
 * snapshot.
 *
 * Cache strategy mirrors theme-base: in-process memo, 60 s on-disk reuse,
 * then Tailwind CLI. Throwing here is loud on purpose — if Tailwind cannot
 * compile, snapshots would silently revert to unstyled and produce
 * misleading pixel diffs.
 */
export async function getCompiledTailwindCss(): Promise<string> {
  if (cachedTailwindCss !== null) return cachedTailwindCss;

  try {
    const stat = await fs.stat(TAILWIND_OUTPUT);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < 60_000) {
      cachedTailwindCss = await fs.readFile(TAILWIND_OUTPUT, 'utf-8');
      return cachedTailwindCss;
    }
  } catch {
    // No prior build — fall through to compile.
  }

  // Resolve Tailwind v3 CLI entry explicitly (pnpm hoists the binary to the
  // super-repo root, so bin-path lookup inside this package can fail).
  const tailwindCli = requireFromHere.resolve('tailwindcss/lib/cli.js');

  execFileSync(
    process.execPath,
    [
      tailwindCli,
      '-c',
      TAILWIND_CONFIG,
      '-i',
      TAILWIND_INPUT,
      '-o',
      TAILWIND_OUTPUT,
      '--minify',
    ],
    { cwd: PACKAGE_ROOT, stdio: 'pipe' },
  );

  cachedTailwindCss = await fs.readFile(TAILWIND_OUTPUT, 'utf-8');
  return cachedTailwindCss;
}

/**
 * Render a block to standalone HTML, pulling markup from either the rose
 * override package or the shared theme-base compiled modules.
 *
 * Example: `renderBlockToHtml('Hero', 'base', props, roseTokensCss)` renders
 * the base Hero with rose design tokens (typical rose use-case).
 * `renderBlockToHtml('Header', 'rose', props, roseTokensCss)` renders the
 * rose override Header.
 */
export async function renderBlockToHtml(
  blockName: string,
  source: BlockSource,
  props: Record<string, unknown>,
  themeTokensCss: string = '',
): Promise<string> {
  const [tailwindCss, body] = await Promise.all([
    getCompiledTailwindCss(),
    (async () => {
      const container = await AstroContainer.create();
      const modFileName = `theme-${source}__${blockName}__${blockName}.mjs`;
      const modPath = path.join(DIST, modFileName);
      const mod = await import(modPath);
      const component = mod.default;
      return container.renderToString(component, { props });
    })(),
  ]);

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Visual Snapshot</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Bitter:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Arsenal:wght@400;700&display=swap">
  <style>
    *, *::before, *::after { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
    html, body { margin: 0; padding: 0; background: rgb(var(--color-bg, 255 255 255)); color: rgb(var(--color-text, 17 17 17)); font-family: var(--font-body, system-ui, sans-serif); }
  </style>
  <style>${tailwindCss}</style>
  <style>${themeTokensCss}</style>
</head>
<body>${body}</body>
</html>`;
}

/**
 * Spin up a local HTTP server that returns `html` for any request. Returns
 * the bound URL + a `stop()` method. Binds to port 0 so the OS picks a
 * free port — avoids collisions when tests run in parallel workers.
 */
export function startSnapshotServer(html: string): Promise<SnapshotServer> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr === null || typeof addr === 'string') {
        reject(new Error('Snapshot server failed to bind to a TCP port'));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        stop: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}
