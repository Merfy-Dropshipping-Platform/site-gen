/**
 * Snapshot render utility — compiles an Astro block to HTML via
 * experimental_AstroContainer and serves it over a throwaway HTTP server
 * so Playwright can navigate and screenshot.
 *
 * Pairs with precompiled blocks under `dist/astro-blocks/` (see
 * `scripts/compile-astro-blocks.mjs`). Run `pnpm build:blocks` in the
 * sites service before invoking `test:visual`.
 */
import { createServer, type Server } from 'node:http';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __snapshots__/ → theme-base/ → packages/ → sites/
const DIST = path.resolve(__dirname, '../../../dist/astro-blocks');

export interface SnapshotServer {
  url: string;
  stop: () => Promise<void>;
}

/**
 * Render a theme-base block to standalone HTML.
 *
 * Given `blockName = 'Hero'`, resolves
 * `dist/astro-blocks/theme-base__Hero__Hero.mjs` and runs it through the
 * Astro Container API. The rendered markup is injected into a minimal HTML
 * shell with the provided `themeTokensCss` (design tokens as CSS vars).
 */
export async function renderBlockToHtml(
  blockName: string,
  props: Record<string, unknown>,
  themeTokensCss: string = '',
): Promise<string> {
  const container = await AstroContainer.create();
  const modPath = path.join(DIST, `theme-base__${blockName}__${blockName}.mjs`);
  const mod = await import(modPath);
  const component = mod.default;
  const body = await container.renderToString(component, { props });

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Visual Snapshot</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap">
  <style>
    *, *::before, *::after { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
    html, body { margin: 0; padding: 0; background: rgb(var(--color-bg, 255 255 255)); color: rgb(var(--color-text, 17 17 17)); font-family: var(--font-body, system-ui, sans-serif); }
    ${themeTokensCss}
  </style>
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
