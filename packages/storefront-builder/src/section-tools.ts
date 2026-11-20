import {
  SECTION_ID,
  RoleTakenError,
  StoreCycleError,
  acceptSection,
  basedOnProblem,
  checkSection,
  declineUpdate,
  draftSource,
  libraryFilesOf,
  problemDoc,
  rollbackSection,
  sectionAnswer,
  sectionHistory,
  sourceWithHash,
  splitMeta,
  storeCycleText,
  updateOfferOf,
  withoutAiFiles,
  type AcceptOptions,
  type AcceptResult,
  type Database,
  type Door,
  type DraftSource,
  type LibraryRef,
  type PrepareResult,
  type SandboxReport,
  type SectionAnswer,
  type SectionFiles,
  type SectionRow,
  type UpdateOffer,
} from '@merfy/storefront-sections';
import type { ObjectStore } from '@merfy/storefront-storage';
import { z } from 'zod';
import { libraryUpdateFindings } from './checks/shop/library-update';
import type { CheckFinding } from './checks/finding';
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
  | 'store-cycle'
  | 'based-on-invalid'
  | 'update-not-offered'
  | 'tool-failed';

export interface ToolError {
  ok: false;
  error: { code: ToolErrorCode; message: string };
}

// Ответ проверки и сохранения: к проблемам — находки магазина по этой секции (сейчас «есть новая версия библиотеки»).
export interface CheckAnswer extends SectionAnswer {
  findings: CheckFinding[];
}

export interface SaveAnswer extends CheckAnswer {
  status: 'accepted' | 'unchanged';
  id: string;
}

// Три версии для переноса правок (20.11): новая версия библиотеки, основа копии (из строки магазина с её отпечатком;
// нет такой строки — null) и текущая копия — она в files рядом. Дифф «основа → копия» строит клиент.
export interface LibraryUpdateAnswer {
  name: string; // имя библиотечной секции
  base: LibraryRef;
  latest: LibraryRef;
  baseFiles: SectionFiles | null;
  latestFiles: SectionFiles | null; // версии нет на диске образа — null
}

export interface SourceAnswer {
  name: string;
  id: string;
  files: SectionFiles;
  // Есть предложение обновить копию — три версии; нет — ключа нет.
  libraryUpdate?: LibraryUpdateAnswer;
}

// Отказ мерчанта от обновления: предложение молчит до следующей версии библиотеки.
export interface DeclineAnswer {
  ok: true;
  name: string;
  declined: { version: number };
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

export interface UpdateTools {
  // Предложение по полному имени секции магазина; нет — undefined.
  offer: (shopId: string, name: string) => Promise<UpdateOffer | undefined>;
  // Текст отказа, если основа `basedOn` не годится для этих файлов; null — годится.
  basedOn: (shopId: string, files: SectionFiles, basedOn: string) => Promise<string | null>;
  // Записать отказ от предложения; предложения нет — undefined.
  decline: (shopId: string, name: string) => Promise<UpdateOffer | undefined>;
  // Файлы основы (из строки магазина) и новой версии (с диска образа).
  versions: (
    shopId: string,
    name: string,
    offer: UpdateOffer,
  ) => Promise<{ base: SectionFiles | null; latest: SectionFiles | null }>;
}

export interface SectionToolsDeps {
  // id магазина новой темы или null — магазина нет, удалён, тема не новой архитектуры.
  shop: (rawShop: string | null) => Promise<string | null>;
  // Песочница процессов закрыта (Р14-13): иначе проверить и сохранить — 503.
  open: () => boolean;
  // Проверка без записи — те же отказы, что у accept, в том числе по реестру (круг чтений сторов).
  check: (door: Door, files: SectionFiles) => Promise<PrepareResult>;
  accept: (door: Door, files: SectionFiles, options?: AcceptOptions) => Promise<AcceptResult>;
  // Предложение обновить копию библиотечной секции (20.11).
  update: UpdateTools;
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
  noOffer: (name: string) =>
    `у секции ${name} нет предложения обновить: новой версии нет, отказ уже записан или копию не меняли`,
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
  const { files } = splitMeta(withoutAiFiles(parsed.data.files));
  const result = await deps.check({ author: 'shop', shopId: request.shopId }, files);
  const answer = sectionAnswer(SECTION_TOOL_PREFIX, files, result);
  deps.log('section-checked', {
    shopId: request.shopId,
    name: answer.name ?? '',
    ok: answer.ok,
    codes: problemCodes(answer).join(','),
  });
  const findings = answer.ok ? await findingsOf(deps, request.shopId, answer.name, files) : [];
  return jsonAnswer(200, { ...answer, findings } satisfies CheckAnswer);
}

// Находки магазина по секции (сейчас одна — новая версия библиотеки): в ответах «проверить» и «сохранить».
async function findingsOf(
  deps: SectionToolsDeps,
  shopId: string,
  name: string | null,
  files: SectionFiles,
): Promise<CheckFinding[]> {
  if (name === null) return [];
  return libraryUpdateFindings(name, files, await deps.update.offer(shopId, name));
}

// Отказ от обновления: тело из одного служебного файла (шлюз других команд не знает), секция сохранена не будет.
async function declined(deps: SectionToolsDeps, shopId: string, name: string): Promise<DrawAnswer> {
  const offer = await deps.update.decline(shopId, name);
  if (offer === undefined) return toolError(404, 'update-not-offered', TEXT.noOffer(name));
  deps.log('section-update-declined', { shopId, name, version: offer.latest.version });
  return jsonAnswer(200, { ok: true, name, declined: { version: offer.latest.version } } satisfies DeclineAnswer);
}

// Сохранить файлы своей секцией магазина — черновиком; отказ проверки — 422, ничего не записано. Служебный файл
// основы (`basedOn`) сверяется с историей библиотеки до записи; служебный файл отказа без файлов секции — отказ.
async function save(deps: SectionToolsDeps, request: ToolRequest): Promise<DrawAnswer> {
  if (!deps.open()) return toolError(503, 'uploads-closed', TEXT.closed);
  const parsed = filesBodySchema.safeParse(readJson(request.body));
  if (!parsed.success) return toolError(400, 'body-invalid', TEXT.body);
  const { files, basedOn, decline } = splitMeta(withoutAiFiles(parsed.data.files));
  if (decline !== undefined && Object.keys(files).length === 0) return declined(deps, request.shopId, decline);
  const baseText = basedOn === undefined ? null : await deps.update.basedOn(request.shopId, files, basedOn);
  if (baseText !== null) return toolError(400, 'based-on-invalid', baseText);
  const door: Door = { author: 'shop', shopId: request.shopId };
  const result = await deps.accept(door, files, basedOn === undefined ? {} : { libraryBase: basedOn });
  if (result.status === 'refused')
    return jsonAnswer(422, sectionAnswer(SECTION_TOOL_PREFIX, files, { ok: false, problems: result.problems }));
  const answer: SaveAnswer = {
    ok: true,
    name: result.row.name,
    problems: [],
    warnings: result.row.warnings.map((problem) => ({ ...problem, doc: problemDoc(problem.code) })),
    findings: await findingsOf(deps, request.shopId, result.row.name, files),
    status: result.status,
    id: result.row.id,
  };
  deps.log('section-saved', { shopId: request.shopId, name: answer.name, status: answer.status });
  return jsonAnswer(200, answer);
}

// Файлы текущей правки своей секции — чтобы ИИ дорабатывал её; есть предложение обновить — ещё три версии.
async function source(deps: SectionToolsDeps, request: ToolRequest): Promise<DrawAnswer> {
  const found = await deps.source(request.shopId, request.name);
  if (found === null) return toolError(404, 'section-not-found', TEXT.section(request.name));
  const offer = await deps.update.offer(request.shopId, request.name);
  const update = offer === undefined ? {} : { libraryUpdate: await updateOf(deps, request, offer) };
  const answer: SourceAnswer = { name: request.name, id: found.id, files: found.files, ...update };
  return jsonAnswer(200, answer);
}

async function updateOf(
  deps: SectionToolsDeps,
  request: ToolRequest,
  offer: UpdateOffer,
): Promise<LibraryUpdateAnswer> {
  const { base, latest } = await deps.update.versions(request.shopId, request.name, offer);
  return { name: offer.name, base: offer.base, latest: offer.latest, baseFiles: base, latestFiles: latest };
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

// Вернуть прежнюю правку: она снова текущая, новых строк нет. Роль прежней правки занята другой секцией — 409; прежняя
// правка стора замкнула бы круг чтений сторов — тоже 409 (свои сторы).
async function rollback(deps: SectionToolsDeps, request: ToolRequest): Promise<DrawAnswer> {
  const parsed = rollbackBodySchema.safeParse(readJson(request.body));
  if (!parsed.success) return toolError(400, 'body-invalid', TEXT.rollback);
  let row: SectionRow | null;
  try {
    row = await deps.rollback(request.shopId, request.name, parsed.data.id);
  } catch (error) {
    if (error instanceof RoleTakenError) return toolError(409, 'role-taken', TEXT.role(error.role, error.holder));
    if (error instanceof StoreCycleError) return toolError(409, 'store-cycle', storeCycleText(error.cycle));
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
  // Пакет storefront-sections в образе: оттуда читается текущая версия библиотечной секции (библиотека — папки пакета).
  libraryDir: string;
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
    check: (door, files) => checkSection({ db: base.db }, door, files),
    accept: (door, files, options) => acceptSection({ db: base.db, store: base.store }, door, files, options),
    update: {
      offer: (shopId, name) => updateOfferOf(base.db, shopId, name),
      basedOn: (shopId, files, basedOn) => basedOnProblem(base.db, shopId, files, basedOn),
      decline: (shopId, name) => declineUpdate(base.db, shopId, name),
      versions: async (shopId, name, offer) => ({
        base: await sourceWithHash(base.db, shopId, name, offer.base.hash),
        latest: (await libraryFilesOf(base.libraryDir, offer.latest)) ?? null,
      }),
    },
    source: (shopId, name) => draftSource(base.db, shopId, name),
    history: (shopId, name) => sectionHistory(base.db, shopId, name),
    errors: (shopId, name) => sectionEditErrors(base.db, shopId, name),
    rollback: (shopId, name, id) => rollbackSection(base.db, shopId, name, id),
    log: base.log,
  };
}
