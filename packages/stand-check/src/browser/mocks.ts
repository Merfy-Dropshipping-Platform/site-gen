import { readFile } from 'node:fs/promises';
import type { Page, Route } from 'playwright';
import { isApiPath, mockReplyOf, parseMockRoutes, type MockRoutes } from '../mocks/routes';
import { packagePath } from '../paths';

const NOT_MOCKED_BODY = JSON.stringify({ error: 'not-mocked', hint: 'запроса нет в mocks/routes.json' });

async function readBodies(table: MockRoutes): Promise<ReadonlyMap<string, string>> {
  const files = [...new Set(table.routes.map((route) => route.file))];
  const texts = await Promise.all(files.map((file) => readFile(packagePath(file), 'utf8')));
  return new Map(files.map((file, index) => [file, texts[index]]));
}

async function fulfill(route: Route, table: MockRoutes, bodies: ReadonlyMap<string, string>): Promise<void> {
  const request = route.request();
  const reply = mockReplyOf(table, request.method(), new URL(request.url()).pathname);
  const body = reply.status === 200 ? bodies.get(reply.file) : NOT_MOCKED_BODY;
  await route.fulfill({ status: reply.status, contentType: 'application/json', body });
}

// Подмена ответов API по таблице (Э2-2 В, локально): запросы к API не уходят в сеть, неизвестные получают 501.
export async function installMocks(page: Page, routes: unknown): Promise<void> {
  const table = parseMockRoutes(routes);
  const bodies = await readBodies(table);
  await page.route(
    (url) => isApiPath(table, url.pathname),
    (route) => fulfill(route, table, bodies),
  );
}
