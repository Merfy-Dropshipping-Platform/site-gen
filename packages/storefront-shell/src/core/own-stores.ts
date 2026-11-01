import { ShellError } from '../errors';
import { messageOf } from '../report';
import { createStoreCtx, type StoreCtxDeps } from './ctx';
import { SECTION_FAILURE_EVENT } from './events';
import { EXT_USE_PREFIX } from './ext-registry';
import { createGuard, type Guard } from './guard';
import type { InstanceRuntime } from './instance';
import { atom, readable, type Atom } from './stores';
import type { FailureStage, Json, ReadableStore, SectionFailureDetail, StoreEntry } from './types';

// Свои сторы страницы (свои сторы, 01.11): код автора без места на странице — значение JSON, которое вычисляет только
// его start(ctx, set) из других сторов, событий и таймеров. Бандл страницы, где стор нужен, передаёт ядру
// start({ …, stores: pageStores([…]) }); на странице без сторов этого кода нет. Ядро зовёт его до запуска секций: фасады
// встают в общий список по порядку зависимостей — стор запускается, когда сторы из его uses уже есть, поэтому uses
// "store:…" стора ядро отдаёт тем же partApi, что и секциям. Фасад — только get (stores.ts): писать в стор снаружи
// нечем. Сбой стора — как сбой секции (instance.ts): merfy:section:error с именем стора, его таймеры и подписки
// снимаются, значение остаётся последним — секции читают его дальше.
export const STORE_USE_PREFIX = 'store:';

export type PageStores = (
  runtime: InstanceRuntime,
  into: Map<string, ReadableStore<Json>>,
  signal: AbortSignal,
) => void;

interface StoreState {
  readonly entry: StoreEntry;
  readonly atom: Atom<Json>;
  readonly controller: AbortController;
  failed: boolean;
}

// Имена своих сторов из uses строки: "store:shop:a" → shop:a.
const storeUsesOf = (entry: StoreEntry): string[] =>
  entry.uses.flatMap((use) => (use.startsWith(STORE_USE_PREFIX) ? [use.slice(STORE_USE_PREFIX.length)] : []));

interface Order {
  readonly ordered: StoreEntry[];
  readonly cycles: Map<string, readonly string[]>; // стор в круге → сам круг: a → b → a
}

// Порядок по зависимостям — обход в глубину по uses "store:…" внутри списка: стор — после сторов, которые он читает.
// Стор не из списка (его нет в бандле) порядка не меняет: его нет и на странице — ядро ответит part-unknown. Стор в
// круге не запускается: круг ловит приём, сюда он доходит только откатом правки.
function orderOf(list: readonly StoreEntry[]): Order {
  const byName = new Map(list.map((entry) => [entry.name, entry]));
  const ordered: StoreEntry[] = [];
  const cycles = new Map<string, readonly string[]>();
  const done = new Set<string>();
  const path: string[] = [];
  const visit = (entry: StoreEntry): void => {
    if (done.has(entry.name)) return;
    const at = path.indexOf(entry.name);
    if (at >= 0) {
      const circle = [...path.slice(at), entry.name];
      circle.slice(0, -1).forEach((name) => cycles.set(name, circle));
      return;
    }
    path.push(entry.name);
    storeUsesOf(entry).forEach((name) => {
      const next = byName.get(name);
      if (next !== undefined) visit(next);
    });
    path.pop();
    done.add(entry.name);
    if (!cycles.has(entry.name)) ordered.push(entry);
  };
  list.forEach(visit);
  return { ordered, cycles };
}

function failOf(runtime: InstanceRuntime, state: StoreState): (stage: FailureStage, error: unknown) => void {
  return (stage, error) => {
    if (state.failed) return;
    state.failed = true;
    state.controller.abort();
    const { name, script } = state.entry;
    const message = messageOf(error);
    const detail: SectionFailureDetail = { section: name, id: name, script, stage, message };
    runtime.bus.emit(SECTION_FAILURE_EVENT, detail);
    console.error(`Сбой стора ${name} (${stage}): ${message}`);
  };
}

// Модули по uses стора — как у секции (instance.ts): "ext:<id>" — в ctx.ext, "store:…" — в ctx.stores. Части нет —
// сбой стадии mount, start не вызывается.
function modulesOf(runtime: InstanceRuntime, entry: StoreEntry): Record<string, unknown> {
  const modules: Record<string, unknown> = {};
  const ext: Record<string, unknown> = {};
  const stores: Record<string, unknown> = {};
  for (const use of entry.uses) {
    const api = runtime.partApi(use);
    if (use.startsWith(EXT_USE_PREFIX)) ext[use.slice(EXT_USE_PREFIX.length)] = api;
    else if (use.startsWith(STORE_USE_PREFIX)) stores[use.slice(STORE_USE_PREFIX.length)] = api;
    else modules[use] = api;
  }
  return { ...modules, ext: Object.freeze(ext), stores: Object.freeze(stores) };
}

// Значение стора — JSON из кода автора: объект — только простой ({…}), не Date, Map и не экземпляр; число — конечное.
function isJson(value: unknown): value is Json {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  if (typeof value !== 'object') return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return (proto === Object.prototype || proto === null) && Object.values(value).every(isJson);
}

const jsonOf = (name: string, value: unknown): Json => {
  if (isJson(value)) return value;
  throw new ShellError(
    'sdk-call-invalid',
    `стор ${name}: значение — JSON (null, булево, число, строка, список, объект)`,
  );
};

const depsOf = (runtime: InstanceRuntime, state: StoreState, run: Guard): StoreCtxDeps => ({
  win: runtime.win,
  bus: runtime.bus,
  owner: state,
  run,
  signal: state.controller.signal,
  page: runtime.page,
  name: state.entry.name,
  mode: runtime.mode,
  theme: runtime.theme,
});

// Запуск одного стора: значение из value (нет — null), модули по uses, ctx на своём сигнале, start через предохранитель.
function launch(runtime: InstanceRuntime, state: StoreState): void {
  const { entry } = state;
  const fail = failOf(runtime, state);
  const run = createGuard(fail);
  let modules: Record<string, unknown>;
  try {
    const initial: unknown = entry.definition.value;
    state.atom.set(jsonOf(entry.name, initial === undefined ? null : initial));
    modules = modulesOf(runtime, entry);
  } catch (error) {
    fail('mount', error);
    return;
  }
  const ctx = createStoreCtx(depsOf(runtime, state, run), modules);
  // После сбоя и снятия set ничего не меняет: значение стора остаётся последним.
  const set = (value: Json): void => {
    if (state.failed || state.controller.signal.aborted) return;
    state.atom.set(jsonOf(entry.name, value));
  };
  run('mount', () => entry.definition.start?.(ctx, set));
}

export function pageStores(list: readonly StoreEntry[]): PageStores {
  return (runtime, into, signal) => {
    const { ordered, cycles } = orderOf(list);
    const stateOf = (entry: StoreEntry): StoreState => {
      const state: StoreState = { entry, atom: atom<Json>(null), controller: new AbortController(), failed: false };
      signal.addEventListener('abort', () => state.controller.abort(), { once: true });
      into.set(entry.name, readable(state.atom));
      return state;
    };
    // Сторы в круге — первыми: их фасады (значение null) уже есть, когда запускаются сторы, которые их читают.
    cycles.forEach((circle, name) => {
      const entry = list.find((item) => item.name === name);
      if (entry === undefined) return;
      const text = `стор ${name} читает сам себя по кругу: ${circle.join(' → ')}`;
      failOf(runtime, stateOf(entry))('mount', new ShellError('store-cycle', text));
    });
    ordered.forEach((entry) => launch(runtime, stateOf(entry)));
  };
}
