import {
  DEFAULT_SANDBOX,
  SECTION_ID,
  RoleTakenError,
  acceptSection,
  draftSource,
  prepareInWorker,
  problemDoc,
  rollbackSection,
  sectionAnswer,
  sectionHistory,
  withoutAiFiles,
  type AcceptResult,
  type Database,
  type Door,
  type DraftSource,
  type PrepareInput,
  type PrepareResult,
  type SandboxReport,
  type SectionAnswer,
  type SectionFiles,
  type SectionRow,
} from '@merfy/storefront-sections';
import type { ObjectStore } from '@merfy/storefront-storage';
import { z } from 'zod';
import type { DrawAnswer } from './draw';
import { errorText } from './errors';
import type { Log } from './log';
import { sectionEditErrors, type SectionEditError } from './section-error-store';
import { jsonAnswer } from './stand-preview';

// Инструменты секций для ИИ и мерчанта (блок 14 «Секций и SDK», 14.7, В14-1 А; договор — plan-14b.md, «Договор»):
// проверить, сохранить черновиком, файлы текущей правки, правки, вернуть прежнюю. Вход sites; магазин — ?shop=, его
// право и организацию проверил шлюз, здесь — что магазин есть и он на теме новой архитектуры. Секция — всегда своя
// секция магазина (способ сохранения shop, владелец — магазин из адреса): из тела читаются только файлы или id правки.
export const SECTION_TOOL_PREFIX = 'shop';
export const SECTION_BODY_LIMIT_BYTES = 512 * 1024;

export type ToolErrorCode =
  | 'body-invalid'
  | 'name-invalid'
  | 'shop-not-found'
  | 'uploads-closed'
  | 'section-not-found'
  | 'edit-not-found'
  | 'role-taken'
  | 'tool-failed';

export interface ToolError {
  ok: false;
  error: { code: ToolErrorCode; message: string };
}

export interface SaveAnswer extends SectionAnswer {
  status: 'accepted' | 'unchanged';
  id: string;
}

export interface SourceAnswer {
  name: string;
  id: string;
  files: SectionFiles;
}

// Ошибка скрипта правки из браузеров покупателей (блок 12 «Секций и SDK», часть 12в, Р12в-10) — в «правках секции».
export interface HistoryEditError {
  stage: string;
  message: string;
  count: number;
  lastAt: string;
}

export interface HistoryAnswer {
  name: string;
  // errors — только у правки, у скрипта которой есть ошибки из браузеров (sectionEditErrors, до трёх).
  edits: { id: string; createdAt: string; draft: boolean; published: boolean; errors?: HistoryEditError[] }[];
}

export interface RollbackAnswer {
  name: string;
  id: string;
  draft: boolean;
  published: boolean;
}

export interface SectionToolsDeps {
  // id магазина новой темы или null — магазина нет, удалён, тема не новой архитектуры.
  shop: (rawShop: string | null) => Promise<string | null>;
  // Песочница процессов закрыта (Р14-13): иначе проверить и сохранить — 503.
  open: () => boolean;
  check: (input: PrepareInput) => Promise<PrepareResult>;
  accept: (door: Door, files: SectionFiles) => Promise<AcceptResult>;
  source: (shopId: string, name: string) => Promise<DraftSource | null>;
  history: (shopId: string, name: string) => Promise<SectionRow[]>;
  // Ошибки скрипта правки из браузеров — для «правок секции» (Р12в-10).
  errors: (shopId: string, name: string) => Promise<SectionEditError[]>;
  rollback: (shopId: string, name: string, id: string) => Promise<SectionRow | null>;
  log: Log;
}

// Тело с файлами: путь → текст; тело с id правки. Лишние ключи — отказ: магазин и автора тело не задаёт.
export const filesBodySchema = z.strictObject({ files: z.record(z.string().min(1).max(200), z.string()) });
export const rollbackBodySchema = z.strictObject({ id: z.uuid() });

const TEXT = {
  body: 'нужно тело JSON { "files": { "<путь>": "<текст>" } }',
  rollback: 'нужно тело JSON { "id": "<id правки>" }',
  name: 'имя секции в адресе — name из section.json: строчные латинские буквы и цифры через одиночный дефис',
  shop: 'магазина нет или он не на теме новой архитектуры',
  closed: 'загрузка секций на этом контуре выключена: песочница процессов рендера не закрыта',
  section: (name: string) => `секции ${name} у магазина нет`,
  edit: (id: string) => `правки ${id} у секции нет`,
  role: (role: string, holder: string) =>
    `роль ${role} у этой правки занята секцией ${holder}: сначала измени ${holder} или сними с неё роль`,
  failed: 'инструмент секций упал: повтори запрос; повторяется — покажи ответ мерчанту',
} as const;

export const toolError = (status: number, code: ToolErrorCode, message: string): DrawAnswer =>
  jsonAnswer(status, { ok: false, error: { code, message } } satisfies ToolError);

// Отчёт песочницы (блок 2, Р28 плана 2а): загрузка секций — только когда закрыто всё и процессы — от другого
// пользователя ОС. Пробы не было (null) — выключено.
const CLOSED_KEYS = ['net', 'child', 'worker', 'write', 'read', 'inspector', 'wasi', 'neighbour'] as const;
export const sectionUploadsOpen = (report: SandboxReport | null): boolean =>
  report !== null &&
  report.env === 0 &&
  report.user === 'separate' &&
  CLOSED_KEYS.every((key) => report[key] === 'closed');

interface ToolRoute {
  method: 'GET' | 'POST';
  // Имя секции в ?name= — нужно маршрутам одной секции.
  named: boolean;
  handle: (deps: SectionToolsDeps, request: ToolRequest) => Promise<DrawAnswer>;
}

interface ToolRequest {
  shopId: string;
  // Полное имя shop:<name> — у маршрутов одной секции, иначе ''.
  name: string;
  body: string;
}

// Проверить файлы, ничего не записывая: ответ проверки — тот же JSON, что у `pnpm merfy section check --json` (Р14-3).
async function check(deps: SectionToolsDeps, request: ToolRequest): Promise<DrawAnswer> {
  if (!deps.open()) return toolError(503, 'uploads-closed', TEXT.closed);
  const parsed = filesBodySchema.safeParse(readJson(request.body));
  if (!parsed.success) return toolError(400, 'body-invalid', TEXT.body);
  const files = withoutAiFiles(parsed.data.files);
  const result = await deps.check({ prefix: SECTION_TOOL_PREFIX, files });
  const answer = sectionAnswer(SECTION_TOOL_PREFIX, files, result);
  deps.log('section-checked', {
    shopId: request.shopId,
    name: answer.name ?? '',
    ok: answer.ok,
    codes: problemCodes(answer).join(','),
  });
  return jsonAnswer(200, answer);
}

// Сохранить файлы своей секцией магазина — черновиком; отказ проверки — 422, ничего не записано.
async function save(deps: SectionToolsDeps, request: ToolRequest): Promise<DrawAnswer> {
  if (!deps.open()) return toolError(503, 'uploads-closed', TEXT.closed);
  const parsed = filesBodySchema.safeParse(readJson(request.body));
  if (!parsed.success) return toolError(400, 'body-invalid', TEXT.body);
  const files = withoutAiFiles(parsed.data.files);
  const door: Door = { author: 'shop', shopId: request.shopId };
  const result = await deps.accept(door, files);
  if (result.status === 'refused')
    return jsonAnswer(422, sectionAnswer(SECTION_TOOL_PREFIX, files, { ok: false, problems: result.problems }));
  const answer: SaveAnswer = {
    ok: true,
    name: result.row.name,
    problems: [],
    warnings: result.row.warnings.map((problem) => ({ ...problem, doc: problemDoc(problem.code) })),
    status: result.status,
    id: result.row.id,
  };
  deps.log('section-saved', { shopId: request.shopId, name: answer.name, status: answer.status });
  return jsonAnswer(200, answer);
}

// Файлы текущей правки своей секции — чтобы ИИ дорабатывал её.
async function source(deps: SectionToolsDeps, request: ToolRequest): Promise<DrawAnswer> {
  const found = await deps.source(request.shopId, request.name);
  if (found === null) return toolError(404, 'section-not-found', TEXT.section(request.name));
  const answer: SourceAnswer = { name: request.name, id: found.id, files: found.files };
  return jsonAnswer(200, answer);
}

// Правки своей секции по времени, текущая и витринная — флагами; у правки с ошибками скрипта — errors.
async function history(deps: SectionToolsDeps, request: ToolRequest): Promise<DrawAnswer> {
  const rows = await deps.history(request.shopId, request.name);
  if (rows.length === 0) return toolError(404, 'section-not-found', TEXT.section(request.name));
  const errors = await deps.errors(request.shopId, request.name);
  const answer: HistoryAnswer = {
    name: request.name,
    edits: rows.map((row) => editWithErrors(row, errors)),
  };
  return jsonAnswer(200, answer);
}

// Правка с ошибками своего отпечатка скрипта (порядок — как пришёл); у правки без ошибок ключа errors нет.
function editWithErrors(row: SectionRow, errors: SectionEditError[]): HistoryAnswer['edits'][number] {
  const edit: HistoryAnswer['edits'][number] = {
    id: row.id,
    createdAt: row.createdAt,
    draft: row.draft,
    published: row.published,
  };
  if (row.scriptHash === null) return edit;
  const own = errors.filter((error) => error.scriptHash === row.scriptHash);
  if (own.length === 0) return edit;
  return {
    ...edit,
    errors: own.map(({ stage, message, count, lastAt }) => ({ stage, message, count, lastAt })),
  };
}

// Вернуть прежнюю правку: она снова текущая, новых строк нет. Роль прежней правки занята другой секцией — 409.
async function rollback(deps: SectionToolsDeps, request: ToolRequest): Promise<DrawAnswer> {
  const parsed = rollbackBodySchema.safeParse(readJson(request.body));
  if (!parsed.success) return toolError(400, 'body-invalid', TEXT.rollback);
  let row: SectionRow | null;
  try {
    row = await deps.rollback(request.shopId, request.name, parsed.data.id);
  } catch (error) {
    if (error instanceof RoleTakenError) return toolError(409, 'role-taken', TEXT.role(error.role, error.holder));
    throw error;
  }
  if (row === null) return toolError(404, 'edit-not-found', TEXT.edit(parsed.data.id));
  const answer: RollbackAnswer = { name: request.name, id: row.id, draft: row.draft, published: row.published };
  return jsonAnswer(200, answer);
}

function readJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function problemCodes(answer: SectionAnswer): string[] {
  return [...answer.problems, ...answer.warnings].map((problem) => problem.code);
}

export const SECTION_TOOL_ROUTES: Readonly<Record<string, ToolRoute>> = {
  '/sections/check': { method: 'POST', named: false, handle: check },
  '/sections/save': { method: 'POST', named: false, handle: save },
  '/sections/source': { method: 'GET', named: true, handle: source },
  '/sections/history': { method: 'GET', named: true, handle: history },
  '/sections/rollback': { method: 'POST', named: true, handle: rollback },
};

// Вход сборщика: маршрут → метод → магазин → имя → обработчик. Сбой обработчика — 500 tool-failed и строка журнала
// section-tool-failed (магазин, адрес, текст ошибки).
export async function sectionTool(
  deps: SectionToolsDeps,
  method: string,
  url: URL,
  body: () => Promise<string>,
): Promise<DrawAnswer> {
  const route = SECTION_TOOL_ROUTES[url.pathname];
  if (route === undefined) return { status: 404, body: '' };
  if (method !== route.method) return { status: 405, body: '' };
  const shopId = await deps.shop(url.searchParams.get('shop'));
  if (shopId === null) return toolError(404, 'shop-not-found', TEXT.shop);
  const rawName = url.searchParams.get('name') ?? '';
  if (route.named && !SECTION_ID.test(rawName)) return toolError(400, 'name-invalid', TEXT.name);
  const name = route.named ? `${SECTION_TOOL_PREFIX}:${rawName}` : '';
  try {
    return await route.handle(deps, { shopId, name, body: route.method === 'POST' ? await body() : '' });
  } catch (error) {
    deps.log('section-tool-failed', { shopId, path: url.pathname, error: errorText(error) });
    return toolError(500, 'tool-failed', TEXT.failed);
  }
}

const SHOP_SQL = 'SELECT id FROM site WHERE id = $1 AND theme_id = ANY($2) AND deleted_at IS NULL';

export interface SectionToolsBase {
  db: Database;
  store: ObjectStore;
  // Темы новой архитектуры образа — как у превью (loaded.themes).
  themeIds: readonly string[];
  open: boolean;
  log: Log;
}

// Зависимости из сборщика: та же база, хранилище и песочница, что у сборки.
export function sectionToolsDeps(base: SectionToolsBase): SectionToolsDeps {
  return {
    shop: async (rawShop) => {
      const shop = z.uuid().safeParse(rawShop);
      if (!shop.success) return null;
      const { rows } = await base.db.query(SHOP_SQL, [shop.data, base.themeIds]);
      return rows.length === 0 ? null : shop.data;
    },
    open: () => base.open,
    check: (input) => prepareInWorker(input, DEFAULT_SANDBOX),
    accept: (door, files) => acceptSection({ db: base.db, store: base.store }, door, files),
    source: (shopId, name) => draftSource(base.db, shopId, name),
    history: (shopId, name) => sectionHistory(base.db, shopId, name),
    errors: (shopId, name) => sectionEditErrors(base.db, shopId, name),
    rollback: (shopId, name, id) => rollbackSection(base.db, shopId, name, id),
    log: base.log,
  };
}
