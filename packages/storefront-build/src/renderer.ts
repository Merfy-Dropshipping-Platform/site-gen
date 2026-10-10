import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { StorefrontBuildError, type StorefrontBuildErrorCode } from './errors';
import type { ShopPageLocals, StandPageLocals } from './locals';

// Рисовальщик (design.md блока 4, В4-4 Б): серверная сборка темы (@astrojs/node в режиме middleware) отдаёт
// handler(req, res, next, locals). Рисовальщик поднимает его на 127.0.0.1 со случайным портом и рисует страницу
// запросом к себе. Данные страницы идут в Astro.locals.merfy по номеру запроса — не в адресе и не в заголовках. Vite
// здесь нет: только node и собранный бандл.
// Стенд темы для превью (блок 8) рисуется тем же рисовальщиком: адрес /theme-stand, данные — в Astro.locals.merfyStand.

// Адрес стенда в серверной сборке темы — тот же, что STAND_PATH стенда блока 2 (stand-check/src/stand-path.mjs).
export const STAND_PAGE_PATH = '/theme-stand';

// Функции, а не методы: render можно отдать отдельно от рисовальщика — this у них нет.
export interface Renderer {
  render: (path: string, locals: ShopPageLocals) => Promise<string>;
  renderStand: (locals: StandPageLocals) => Promise<string>;
  close: () => Promise<void>;
}

type AstroLocals = { merfy?: ShopPageLocals; merfyStand?: StandPageLocals };
type NodeHandler = (req: IncomingMessage, res: ServerResponse, next: undefined, locals: AstroLocals) => unknown;

const RENDER_ID_HEADER = 'x-merfy-render-id';
const LOOPBACK = '127.0.0.1';
// Ответ рисовальщика не 200 — ошибка; 404 — у темы нет такой страницы.
const ERROR_BY_STATUS = new Map<number, StorefrontBuildErrorCode>([[404, 'page-unknown']]);

const isNodeHandler = (value: unknown): value is NodeHandler => typeof value === 'function';

const handlerOf = (entry: unknown): unknown =>
  typeof entry === 'object' && entry !== null && 'handler' in entry ? entry.handler : undefined;

async function loadHandler(serverEntry: string): Promise<NodeHandler> {
  const entry: unknown = await import(pathToFileURL(serverEntry).href);
  const handler = handlerOf(entry);
  if (isNodeHandler(handler)) return handler;
  const text = 'нет handler: тема собрана не адаптером @astrojs/node в режиме middleware';
  throw new StorefrontBuildError('renderer-invalid', text, { path: serverEntry });
}

function portOf(address: string | AddressInfo | null): number {
  if (typeof address === 'object' && address !== null) return address.port;
  throw new StorefrontBuildError('renderer-invalid', 'рисовальщик не получил порт');
}

const listen = (server: Server): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, LOOPBACK, () => resolve(portOf(server.address())));
  });

const close = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
    server.closeAllConnections();
  });

function checkPath(path: string): void {
  if (path.startsWith('/') && !path.startsWith('//')) return;
  throw new StorefrontBuildError('page-unknown', 'адрес страницы начинается с одной косой черты', { path });
}

function checkResponse(path: string, status: number): void {
  if (status === 200) return;
  const code = ERROR_BY_STATUS.get(status) ?? 'render-failed';
  throw new StorefrontBuildError(code, `рисовальщик ответил ${status}`, { path });
}

// Поднять рисовальщик из серверной сборки темы. После работы — close(): порт и соединения освобождаются.
export async function startRenderer(serverEntry: string): Promise<Renderer> {
  const handler = await loadHandler(serverEntry);
  const pending = new Map<string, AstroLocals>();
  const server = createServer((req, res) => {
    const id = req.headers[RENDER_ID_HEADER];
    void handler(req, res, undefined, (typeof id === 'string' ? pending.get(id) : undefined) ?? {});
  });
  const base = `http://${LOOPBACK}:${await listen(server)}`;
  let requests = 0;
  const draw = async (path: string, locals: AstroLocals): Promise<string> => {
    checkPath(path);
    const id = String((requests += 1));
    pending.set(id, locals);
    try {
      const response = await fetch(`${base}${path}`, { headers: { [RENDER_ID_HEADER]: id } });
      const html = await response.text();
      checkResponse(path, response.status);
      return html;
    } finally {
      pending.delete(id);
    }
  };
  return {
    render: (path, locals) => draw(path, { merfy: locals }),
    renderStand: (locals) => draw(STAND_PAGE_PATH, { merfyStand: locals }),
    close: () => close(server),
  };
}
