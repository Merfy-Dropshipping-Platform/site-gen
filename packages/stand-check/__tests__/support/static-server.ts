import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

export type StaticServer = { url: string; close: () => Promise<void> };

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
};

// Отдаёт файлы папки по HTTP: паспорту нужен настоящий адрес — хранилище и cookie на about:blank не работают.
export async function serveFolder(folder: string): Promise<StaticServer> {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://stand.test').pathname;
    const type = CONTENT_TYPES[path.extname(pathname)] ?? 'application/octet-stream';
    void readFile(path.join(folder, pathname)).then(
      (body) => response.writeHead(200, { 'content-type': type }).end(body),
      () => response.writeHead(404).end(),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('сервер не получил порт');
  const close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return { url: `http://127.0.0.1:${address.port}`, close };
}
