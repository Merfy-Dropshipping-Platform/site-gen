/**
 * Snapshot render utility — compiles an Astro block to HTML via
 * experimental_AstroContainer and serves it over a throwaway HTTP server
 * so Playwright can navigate and screenshot.
 *
 * Pairs with precompiled blocks under `dist/astro-blocks/` (see
 * `scripts/compile-astro-blocks.mjs`). Run `pnpm build:blocks` in the
 * sites service before invoking `test:visual`.
 *
 * Tailwind CSS is compiled once per test run and cached to
 * `__snapshots__/tailwind-compiled.css` (gitignored). This gives the
 * snapshot HTML real utility classes instead of unstyled markup, making
 * pixel diffs meaningful.
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
// __snapshots__/ → theme-base/ → packages/ → sites/
const DIST = path.resolve(__dirname, '../../../dist/astro-blocks');
const SNAPSHOTS_DIR = __dirname;
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const TAILWIND_CONFIG = path.join(SNAPSHOTS_DIR, 'tailwind.config.cjs');
const TAILWIND_INPUT = path.join(SNAPSHOTS_DIR, 'tailwind-input.css');
const TAILWIND_OUTPUT = path.join(SNAPSHOTS_DIR, 'tailwind-compiled.css');

export interface SnapshotServer {
  url: string;
  stop: () => Promise<void>;
}

let cachedTailwindCss: string | null = null;

/**
 * Compile (or reuse) the Tailwind CSS bundle used by every visual snapshot.
 *
 * Cache strategy:
 *   - Memoize in-process across tests in a single run.
 *   - On cold start, reuse on-disk artifact if it is fresher than 60 s.
 *   - Otherwise invoke the standalone Tailwind CLI (v3) via Node.
 *
 * Throwing here is loud on purpose — if Tailwind cannot compile, snapshots
 * would silently revert to unstyled and produce misleading pixel diffs.
 */
export async function getCompiledTailwindCss(): Promise<string> {
  if (cachedTailwindCss !== null) return cachedTailwindCss;

  // Reuse a recently-built artifact to keep test start-up fast.
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

  // Resolve the Tailwind v3 CLI entry explicitly so we don't depend on a
  // `tailwindcss` binary being present in `node_modules/.bin` (pnpm hoists
  // that to the super-repo root in this monorepo).
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
 * Render a theme-base block to standalone HTML.
 *
 * Given `blockName = 'Hero'`, resolves
 * `dist/astro-blocks/theme-base__Hero__Hero.mjs` and runs it through the
 * Astro Container API. The rendered markup is injected into a minimal HTML
 * shell along with the compiled Tailwind utility bundle and the provided
 * `themeTokensCss` (design tokens as CSS vars — always declared after
 * Tailwind so tokens override any base/utility defaults).
 */
export async function renderBlockToHtml(
  blockName: string,
  props: Record<string, unknown>,
  themeTokensCss: string = '',
): Promise<string> {
  const [tailwindCss, body] = await Promise.all([
    getCompiledTailwindCss(),
    (async () => {
      const container = await AstroContainer.create();
      const modPath = path.join(
        DIST,
        `theme-base__${blockName}__${blockName}.mjs`,
      );
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
