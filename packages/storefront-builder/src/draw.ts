import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  StorefrontBuildError,
  parseBuildInputs,
  renderShopPage,
  type CodeAssets,
  type CodeNoticed,
  type PageRender,
  type RenderSection,
} from '@merfy/storefront-build';
import { withSectionRenderer } from '@merfy/storefront-sections';
import { hexOf, recordDrawnPage, type ObjectStore } from '@merfy/storefront-storage';
import { LIST_ARGS_MAX, listAt } from './list-rpc';
import { z } from 'zod';
import type { LoadedTheme } from './build-job';
import { errorText } from './errors';
import type { Log } from './log';
import type { Slots } from './slots';
import { readSnapshot, type SnapshotDeps } from './snapshot';
import type { ThemeCatalog } from './theme-catalog';
import { sectionPreview, shopPreview, shopPreviewDeps, shopSections } from './shop-preview';
import { standTokens, themePanel, type PreviewDeps } from './stand-preview';
import { EXTENSION_SECTION_ROUTE, extensionSection } from './extension-section';
import type { SdkDocs } from './sdk-docs';
import { SECTION_BODY_LIMIT_BYTES, SECTION_TOOL_ROUTES, sectionTool, type SectionToolsDeps } from './section-tools';

// Дорисовка мимо очереди (design.md блока 6, В6-2, вариант 2; Св-1 В): раздача (блок 5, nginx-minio-proxy,
// storefront/) на промахе зовёт GET /draw?shop&build&path&render&theme[&list] и ждёт страницу. Свои места — не места сборок;
// мест нет или не успели за тайм-аут — 503, страница придёт со следующей сборкой. Версия живой сборки не та, что у
// сборщика, — 409: рисовать чужой версией нельзя. Такой страницы у темы нет — 404. Дорисованная страница ложится в
// список дорисовок сборки (recordDrawnPage блока 5), заголовок X-Merfy-Hash — её отпечаток.

export interface DrawDeps {
  store: ObjectStore;
  snapshot: SnapshotDeps;
  themes: ReadonlyMap<string, LoadedTheme>;
  // Версия живой сборки — из запроса раздачи (блок 10): образ или архив прошлой версии.
  catalog: Pick<ThemeCatalog, 'stateOf' | 'themeAt'>;
  renderHash: string;
  slots: Slots;
  timeoutMs: number;
  log: Log;
  // Превью конструктора (блок 8): /preview и /preview/tokens. Нет — эти адреса отвечают 404.
  preview?: PreviewDeps;
  // Инструменты секций (/sections/check, /save, /source, /history, /rollback) и документация SDK (/sdk-docs) — блок 14
  // «Секций и SDK». Нет — эти адреса отвечают 404.
  sections?: SectionToolsDeps;
  docs?: SdkDocs;
}

export interface DrawAnswer {
  status: number;
  body: string;
  hash?: string;
  // Свои заголовки ответа (превью: тип и no-store); без них — HTML.
  headers?: Readonly<Record<string, string>>;
}

const drawQuerySchema = z.object({
  shop: z.string().min(1),
  build: z.coerce.number().int().positive(),
  path: z.string().startsWith('/'),
  render: z.string().min(1),
  theme: z.string().min(1),
  // Блок 11 «Секций и SDK», часть 11а-2: параметры списка в каноническом виде (nginx route.js, listArgs); есть —
  // страница рисуется с ними и в список дорисовок не идёт.
  list: z.string().min(1).max(LIST_ARGS_MAX).optional(),
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

// theme=<тема>@<версия> — версия живой сборки (блок 5). Платформа — только своя: код платформы не закрепить.
const labelOf = (label: string): { id: string; version: string } => {
  const [id, version] = label.split('@');
  return { id, version: version ?? '' };
};

async function sameVersion(deps: DrawDeps, query: DrawQuery): Promise<boolean> {
  const label = labelOf(query.theme);
  if (query.render !== deps.renderHash || !deps.themes.has(label.id)) return false;
  return (await deps.catalog.stateOf(label.id, label.version)) !== null;
}

// Рендер страницы опубликованного сайта по запросу: упавшую секцию пропускаем, как в сборке (блок 2 «Секций и SDK»),
// и пишем строку журнала; строку таблицы ошибок пишет сборка — данные у них одни. Бандл страницы (часть 5б) — из тех же
// входов и байтов, что у сборки: тот же файл _merfy/b/<sha256>.js, его уже записала сборка; предупреждения бандла —
// строкой журнала, как у сборки.
function livePage(deps: DrawDeps, query: DrawQuery, assets: CodeAssets, render: RenderSection): PageRender {
  const failed: PageRender['failed'] = (failure) =>
    deps.log('section-render-failed', {
      shopId: query.shop,
      path: query.path,
      section: failure.section,
      sectionId: failure.id,
      stage: failure.stage,
      error: failure.message,
    });
  const notice: CodeNoticed = (page, item) =>
    deps.log(item.code, {
      shopId: query.shop,
      path: query.path,
      page,
      section: item.section,
      bytes: item.bytes,
      error: item.message,
    });
  return { sections: { modules: assets.renders, render }, mode: 'live', failed, code: assets, notice };
}

async function draw(deps: DrawDeps, query: DrawQuery): Promise<DrawAnswer> {
  if (!(await sameVersion(deps, query))) return { status: 409, body: TEXT.version };
  const label = labelOf(query.theme);
  const snapshot = await readSnapshot(deps.snapshot, query.shop);
  // Магазин уже закреплён на другой версии — его живая сборка вот-вот сменится: чужой версией не рисуем.
  if (snapshot.inputs.theme.version !== label.version) return { status: 409, body: TEXT.version };
  const theme = await deps.catalog.themeAt(label.id, label.version);
  const inputs = parseBuildInputs(snapshot.inputs);
  // Параметры списка (блок 11, часть 11а-2): товары страницы и значения фильтров — у сервиса product.
  const list =
    query.list === undefined
      ? undefined
      : await listAt(deps.snapshot.products, query.shop, inputs, query.path, theme.build, query.list);
  const page = await withSectionRenderer((render) =>
    renderShopPage(inputs, query.path, theme.build, livePage(deps, query, snapshot.assets, render), list),
  );
  // Страница с параметрами списка — ответ этому покупателю: без списка дорисовок и без отпечатка (Р11а-18).
  if (query.list !== undefined) return { status: 200, body: new TextDecoder().decode(page.file.content) };
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
    ...answer.headers,
  };
  response.writeHead(answer.status, headers).end(answer.body);
}

// Тело запроса превью — правки токенов, это килобайты. Больше предела — не читаем.
const BODY_LIMIT_BYTES = 256 * 1024;

async function bodyOf(request: IncomingMessage, limit = BODY_LIMIT_BYTES): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += piece.length;
    if (size > limit) return '';
    chunks.push(piece);
  }
  return Buffer.concat(chunks).toString('utf8');
}

interface PreviewRoute {
  method: 'GET' | 'POST';
  handle: (preview: PreviewDeps, url: URL, request: IncomingMessage) => Promise<DrawAnswer>;
}

// Входы sites для конструктора (блок 8; блок 1 «Секций и SDK»): превью главной и стенд, один блок, список секций,
// правки токенов, схема панели.
const PREVIEW_ROUTES: Readonly<Record<string, PreviewRoute>> = {
  '/preview': { method: 'GET', handle: (preview, url) => shopPreview(shopPreviewDeps(preview), url) },
  '/preview/section': {
    method: 'POST',
    handle: async (preview, url, request) =>
      sectionPreview(shopPreviewDeps(preview), url.searchParams.get('shop'), await bodyOf(request)),
  },
  '/sections': {
    method: 'GET',
    handle: (preview, url) => shopSections(shopPreviewDeps(preview), url.searchParams.get('shop')),
  },
  '/preview/tokens': {
    method: 'POST',
    handle: async (preview, url, request) => standTokens(preview, url.searchParams.get('shop'), await bodyOf(request)),
  },
  '/theme-panel': {
    method: 'GET',
    handle: (preview, url) => Promise.resolve(themePanel(preview, url.searchParams.get('theme'))),
  },
};

// Сбой — 500 и строка журнала; не тот метод — 405.
async function previewRoute(preview: PreviewDeps, request: IncomingMessage, url: URL): Promise<DrawAnswer> {
  const entry = PREVIEW_ROUTES[url.pathname];
  if (request.method !== entry.method) return { status: 405, body: '' };
  try {
    return await entry.handle(preview, url, request);
  } catch (error) {
    preview.log('preview-failed', {
      shopId: url.searchParams.get('shop'),
      path: url.pathname,
      error: errorText(error),
    });
    return { status: 500, body: TEXT.failed };
  }
}

async function route(deps: DrawDeps, request: IncomingMessage): Promise<DrawAnswer> {
  const url = new URL(request.url ?? '/', 'http://builder');
  if (url.pathname === '/health') return { status: 200, body: 'ok\n' };
  if (url.pathname in PREVIEW_ROUTES && deps.preview) return previewRoute(deps.preview, request, url);
  // Секция версии расширения от сервиса extensions через sites (блок 12 «Секций и SDK», 12.6).
  if (url.pathname === EXTENSION_SECTION_ROUTE && deps.sections) {
    const read = (): Promise<string> => bodyOf(request, SECTION_BODY_LIMIT_BYTES);
    return extensionSection(deps.sections, request.method ?? '', url, read);
  }
  if (url.pathname in SECTION_TOOL_ROUTES && deps.sections) {
    const read = (): Promise<string> => bodyOf(request, SECTION_BODY_LIMIT_BYTES);
    return sectionTool(deps.sections, request.method ?? '', url, read);
  }
  if (url.pathname === '/sdk-docs' && deps.docs) return deps.docs.answer(url.searchParams.get('file'));
  if (url.pathname !== '/draw') return { status: 404, body: '' };
  return drawPage(deps, Object.fromEntries(url.searchParams));
}

// Вход раздачи: /draw и /health (проверка здоровья приложения Coolify); входы sites для конструктора — /preview,
// /preview/tokens и /theme-panel (блок 8). Слушает порт из настроек.
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
