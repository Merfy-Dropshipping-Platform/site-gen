import type { SectionDefinition } from './define';
import { ShellError } from './errors';
import { definitionOf, importWithRetry, type ImportModule } from './loader';
import { isModuleEntry } from './modules';
import type { SectionRegistry } from './registry';
import { messageOf } from './report';

// Правка кода секции в превью на лету (design.md блока 7, С7-22 В). Конструктор (блок 8) шлёт в рамку превью сообщение
// update-section: имя секции, её новый HTML и адрес нового скрипта (у файла с отпечатком адрес у каждой правки новый;
// null — у новой версии скрипта нет, п. 16). Ядро грузит новый модуль, у живых элементов секции берёт состояние
// (saveState), снимает старый код (unmount), ставит новый HTML и запускает новый код с этим состоянием (mount). Ответ —
// сообщение section-updated с итогом:
// - kept-state — новый код живой, состояние перенесено;
// - fresh — новый код живой, но с нуля: состояние он не принял или его не было;
// - failed — новый код «не ожил» (секция помечена, С7-16 А) или в модуле нет определения (тогда старый код работает);
//   текст ошибки — в message, его конструктор отдаёт ИИ;
// - reloaded — модуль не загрузился и после повтора или это замена номер REPLACE_LIMIT: превью перезагружается целиком;
// - superseded — пока модуль грузился, пришла правка новее, эта не применялась;
// - absent — секции на странице нет.
export const UPDATE_SECTION = 'update-section';
export const SECTION_UPDATED = 'section-updated';
// Старые модули остаются в памяти страницы: замена номер 20 — перезагрузка вместо замены (число — допущение плана).
export const REPLACE_LIMIT = 20;
// У новой версии нет скрипта: имя всё равно проверяет isModuleEntry, а ей нужен адрес — подставляем корень.
const NO_SCRIPT = '/';
const LIMIT_TEXT = `${REPLACE_LIMIT} замен кода без перезагрузки — превью перезагружается`;

export type ReplaceOutcome = 'kept-state' | 'fresh' | 'failed' | 'reloaded' | 'superseded' | 'absent';

export interface SectionUpdate {
  name: string;
  html: string;
  src: string | null;
}

export interface SectionUpdated {
  type: typeof SECTION_UPDATED;
  name: string;
  outcome: ReplaceOutcome;
  message: string | null;
}

export interface PreviewDeps {
  registry: SectionRegistry;
  importModule: ImportModule;
  // Адрес страницы: от него повтор загрузки (?merfy-retry=1).
  base: string;
  // Адрес и имя модуля — чтобы ошибки нового кода после запуска нашли свою секцию (sources.ts).
  remember: (src: string, name: string) => void;
  reload: () => void;
}

interface Result {
  outcome: ReplaceOutcome;
  message: string | null;
}

type Loaded = { ok: true; definition: SectionDefinition | null } | { ok: false; result: Result };

interface ReplacerState {
  deps: PreviewDeps;
  // Номер последней правки каждой секции: правка с другим номером уже устарела.
  tickets: Map<string, number>;
  replaced: number;
  // Замены — по одной: следующая ждёт конца предыдущей.
  queue: Promise<unknown>;
}

// Итог секции с несколькими элементами — худший из итогов элементов.
const RANK: readonly ReplaceOutcome[] = ['failed', 'fresh', 'kept-state'];

const result = (outcome: ReplaceOutcome, error?: unknown): Result => ({
  outcome,
  message: error === undefined ? null : messageOf(error),
});

const field = (data: object, key: string): unknown => Reflect.get(data, key);

// Сообщение конструктора; чужое или битое — null. Имя и адрес проверяет та же функция, что строки списка модулей.
function parseUpdate(data: unknown): SectionUpdate | null {
  if (typeof data !== 'object' || data === null || field(data, 'type') !== UPDATE_SECTION) return null;
  const html = field(data, 'html');
  const src = field(data, 'src');
  const entry: unknown = { kind: 'section', name: field(data, 'name'), src: src === null ? NO_SCRIPT : src };
  if (typeof html !== 'string' || !isModuleEntry(entry)) return null;
  return { name: entry.name, html, src: src === null ? null : entry.src };
}

// Новый модуль — до снятия старого кода. Нет определения — failed, старый код живой. Не загрузился (сеть или ошибка при
// загрузке) — reloaded: перезагрузка покажет превью таким, каким его соберёт сервер.
async function loadCode(deps: PreviewDeps, update: SectionUpdate): Promise<Loaded> {
  if (update.src === null) return { ok: true, definition: null };
  deps.remember(update.src, update.name);
  try {
    const module = await importWithRetry(deps.importModule, update.src, deps.base);
    return { ok: true, definition: definitionOf(module, update.src) };
  } catch (error) {
    return { ok: false, result: result(error instanceof ShellError ? 'failed' : 'reloaded', error) };
  }
}

// Новая версия на одном элементе: с состоянием старой; не вышло — ещё раз с нуля и с чистым HTML; и так не вышло —
// секция «не ожила» (С7-16 А).
async function restart(registry: SectionRegistry, element: HTMLElement, html: string, state: unknown): Promise<Result> {
  element.innerHTML = html;
  const kept = state !== undefined && (await registry.tryStart(element, state)).ok;
  if (kept) return result('kept-state');
  if (state !== undefined) element.innerHTML = html;
  const fresh = await registry.tryStart(element, undefined);
  if (fresh.ok) return result('fresh');
  registry.failElement(element, 'mount', fresh.error);
  return result('failed', fresh.error);
}

// Замена на всех элементах секции: состояния — до снятия, снятие — до нового определения, запуск — после него. У новой
// версии без скрипта состояние некому отдать.
async function replaceCode(
  registry: SectionRegistry,
  elements: readonly HTMLElement[],
  update: SectionUpdate,
  definition: SectionDefinition | null,
): Promise<Result[]> {
  const states = elements.map((element) => (definition === null ? undefined : registry.saveState(element)));
  await Promise.all(elements.map((element) => registry.stop(element)));
  registry.adopt(update.name, definition, update.src);
  return Promise.all(elements.map((element, index) => restart(registry, element, update.html, states[index])));
}

const worst = (results: readonly Result[]): Result =>
  results.reduce((left, right) => (RANK.indexOf(right.outcome) < RANK.indexOf(left.outcome) ? right : left));

async function apply(state: ReplacerState, update: SectionUpdate, ticket: number, loaded: Loaded): Promise<Result> {
  if (state.tickets.get(update.name) !== ticket) return result('superseded');
  if (!loaded.ok) return loaded.result;
  const elements = state.deps.registry.elementsOf(update.name);
  if (elements.length === 0) return result('absent');
  state.replaced += 1;
  if (state.replaced >= REPLACE_LIMIT) return result('reloaded', LIMIT_TEXT);
  return worst(await replaceCode(state.deps.registry, elements, update, loaded.definition));
}

async function replace(state: ReplacerState, update: SectionUpdate): Promise<Result> {
  if (state.deps.registry.elementsOf(update.name).length === 0) return result('absent');
  const ticket = (state.tickets.get(update.name) ?? 0) + 1;
  state.tickets.set(update.name, ticket);
  const loaded = await loadCode(state.deps, update);
  const run = state.queue.then(() => apply(state, update, ticket, loaded));
  state.queue = run.catch(() => undefined);
  return run;
}

function createReplacer(deps: PreviewDeps): (update: SectionUpdate) => Promise<Result> {
  const state: ReplacerState = { deps, tickets: new Map(), replaced: 0, queue: Promise.resolve() };
  return (update) => replace(state, update);
}

// Слушает только родителя — рамку конструктора. Страница не в рамке: parent === window, сообщения себе (так шлёт тест в
// jsdom); скрипты страницы и так исполняются в ней — новой возможности это не даёт. Ответ — только источнику сообщения.
export function listenPreview(win: Window, deps: PreviewDeps, signal: AbortSignal): void {
  const replace = createReplacer(deps);
  const answer = async (event: MessageEvent): Promise<void> => {
    const data: unknown = event.data;
    const update = event.source === win.parent ? parseUpdate(data) : null;
    if (update === null) return;
    const done = await replace(update);
    const reply: SectionUpdated = { type: SECTION_UPDATED, name: update.name, ...done };
    win.parent.postMessage(reply, event.origin);
    if (done.outcome === 'reloaded') deps.reload();
  };
  win.addEventListener('message', (event) => void answer(event), { signal });
}
