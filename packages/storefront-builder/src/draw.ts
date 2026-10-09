import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { StorefrontBuildError, parseBuildInputs, renderShopPage } from '@merfy/storefront-build';
import { hexOf, recordDrawnPage, type ObjectStore } from '@merfy/storefront-storage';
import { z } from 'zod';
import type { LoadedTheme } from './build-job';
import { errorText } from './errors';
import type { Log } from './log';
import type { Slots } from './slots';
import { readSnapshot, type SnapshotDeps } from './snapshot';

// Дорисовка мимо очереди (design.md блока 6, В6-2, вариант 2; Св-1 В): раздача (блок 5, nginx-minio-proxy,
// storefront/) на промахе зовёт GET /draw?shop&build&path&render&theme и ждёт страницу. Свои места — не места сборок;
// мест нет или не успели за тайм-аут — 503, страница придёт со следующей сборкой. Версия живой сборки не та, что у
// сборщика, — 409: рисовать чужой версией нельзя. Такой страницы у темы нет — 404. Дорисованная страница ложится в
// список дорисовок сборки (recordDrawnPage блока 5), заголовок X-Merfy-Hash — её отпечаток.

export interface DrawDeps {
  store: ObjectStore;
  snapshot: SnapshotDeps;
  themes: ReadonlyMap<string, LoadedTheme>;
  renderHash: string;
  slots: Slots;
  timeoutMs: number;
  log: Log;
}

export interface DrawAnswer {
  status: number;
  body: string;
  hash?: string;
}

const drawQuerySchema = z.object({
  shop: z.string().min(1),
  build: z.coerce.number().int().positive(),
  path: z.string().startsWith('/'),
  render: z.string().min(1),
  theme: z.string().min(1),
});
type DrawQuery = z.infer<typeof drawQuerySchema>;

const TEXT = {
  invalid: 'запрос дорисовки не по формату',
  busy: 'мест дорисовки нет',
  late: 'не успели за тайм-аут',
  version: 'живая сборка — другой версии',
  failed: 'дорисовка упала',
} as const;

// Ошибка рисования → ответ раздаче. Неизвестная ошибка — 503: страница придёт со сборкой.
const STATUS_BY_CODE: Readonly<Record<string, number>> = { 'page-unknown': 404 };

const themeLabel = (id: string, theme: LoadedTheme): string => `${id}@${theme.version}`;

function sameVersion(deps: DrawDeps, query: DrawQuery): boolean {
  const themeId = query.theme.split('@')[0];
  const theme = deps.themes.get(themeId);
  return theme !== undefined && query.render === deps.renderHash && query.theme === themeLabel(themeId, theme);
}

async function draw(deps: DrawDeps, query: DrawQuery): Promise<DrawAnswer> {
  if (!sameVersion(deps, query)) return { status: 409, body: TEXT.version };
  const snapshot = await readSnapshot(deps.snapshot, query.shop);
  const theme = deps.themes.get(snapshot.inputs.theme.id);
  if (theme === undefined) return { status: 409, body: TEXT.version };
  const page = await renderShopPage(parseBuildInputs(snapshot.inputs), query.path, theme.build);
  const drawn = { shop: query.shop, build: query.build, row: page.row, content: page.file.content };
  await recordDrawnPage(deps.store, drawn);
  return { status: 200, body: new TextDecoder().decode(page.file.content), hash: hexOf(page.row.hash) };
}

function failed(deps: DrawDeps, query: DrawQuery, error: unknown): DrawAnswer {
  const code = error instanceof StorefrontBuildError ? error.code : '';
  const status = STATUS_BY_CODE[code] ?? 503;
  deps.log('draw-failed', { shopId: query.shop, path: query.path, status, error: errorText(error) });
  return { status, body: TEXT.failed };
}

const late = (ms: number): Promise<DrawAnswer> =>
  new Promise((resolve) => setTimeout(() => resolve({ status: 503, body: TEXT.late }), ms));

// Одна дорисовка: место → рисуем, но не дольше тайм-аута. Место освобождается, когда работа правда кончилась, а не
// по тайм-ауту: иначе мест стало бы больше, чем задано.
export async function drawPage(deps: DrawDeps, raw: unknown): Promise<DrawAnswer> {
  const parsed = drawQuerySchema.safeParse(raw);
  if (!parsed.success) return { status: 400, body: TEXT.invalid };
  const release = deps.slots.take();
  if (release === null) return { status: 503, body: TEXT.busy };
  const work = draw(deps, parsed.data).catch((error: unknown) => failed(deps, parsed.data, error));
  void work.finally(release);
  return Promise.race([work, late(deps.timeoutMs)]);
}

function send(response: ServerResponse, answer: DrawAnswer): void {
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    ...(answer.hash ? { 'X-Merfy-Hash': answer.hash } : {}),
  };
  response.writeHead(answer.status, headers).end(answer.body);
}

async function route(deps: DrawDeps, request: IncomingMessage): Promise<DrawAnswer> {
  const url = new URL(request.url ?? '/', 'http://builder');
  if (url.pathname === '/health') return { status: 200, body: 'ok\n' };
  if (url.pathname !== '/draw') return { status: 404, body: '' };
  return drawPage(deps, Object.fromEntries(url.searchParams));
}

// Вход раздачи: /draw и /health (проверка здоровья приложения Coolify). Слушает порт из настроек.
export function startDrawServer(deps: DrawDeps, port: number): Promise<Server> {
  const server = createServer(
    (request, response) => void route(deps, request).then((answer) => send(response, answer)),
  );
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

export const portOf = (server: Server): number => {
  const address: string | AddressInfo | null = server.address();
  return typeof address === 'object' && address !== null ? address.port : 0;
};
