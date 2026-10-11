import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join } from 'node:path';

// Сервер фикстур для Chromium: страница, модули секций и собранное ядро. Журнал — путь и query каждого запроса.
// /_merfy/shell/<сборка>/<файл> → <distDir>/<сборка>/shell/<файл>; в HTML __SHELL__ — сборка из ?shell= (full).
// /m/flaky.js — первый запрос после открытия страницы отвечает 503 (повтор загрузчика); /m/down.js — всегда 503.
export interface FixtureServer {
  origin: string;
  requests: string[];
  close: () => Promise<void>;
}

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const SHELL_PREFIX = '/_merfy/shell/';

function pathOf(url: URL, fixturesDir: string, distDir: string): string {
  if (!url.pathname.startsWith(SHELL_PREFIX))
    return join(fixturesDir, url.pathname === '/' ? 'index.html' : url.pathname);
  const [build = '', ...rest] = url.pathname.slice(SHELL_PREFIX.length).split('/');
  return join(distDir, build, 'shell', ...rest);
}

async function sendFile(response: ServerResponse, url: URL, path: string): Promise<void> {
  const body = await readFile(path);
  const type = TYPES[extname(path)] ?? 'application/octet-stream';
  const shell = url.searchParams.get('shell') ?? 'full';
  response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
  response.end(type.startsWith('text/html') ? body.toString('utf8').replaceAll('__SHELL__', shell) : body);
}

export async function startFixtureServer(fixturesDir: string, distDir: string): Promise<FixtureServer> {
  const requests: string[] = [];
  const failed = new Set<string>();
  const unavailable = (path: string): boolean => {
    if (path === '/') failed.clear();
    if (path === '/m/down.js') return true;
    if (path !== '/m/flaky.js' || failed.has(path)) return false;
    failed.add(path);
    return true;
  };
  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? '/', 'http://fixture.local');
    requests.push(`${url.pathname}${url.search}`);
    if (unavailable(url.pathname)) return void response.writeHead(503).end();
    await sendFile(response, url, pathOf(url, fixturesDir, distDir)).catch(() => void response.writeHead(404).end());
  };
  const server = createServer((request, response) => void handle(request, response));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  const close = (): Promise<void> =>
    new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return { origin: `http://127.0.0.1:${port}`, requests, close };
}
