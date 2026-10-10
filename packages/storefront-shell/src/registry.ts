import type { SectionDefinition } from './define';
import { messageOf, reportFailure, type FailureStage, type SectionFailure } from './report';

// Живые секции страницы (design.md блока 7, С7-15 Б и С7-16 А). Реестр ведёт элементы
// <merfy-section data-section="<имя>"> и определения секций из их модулей. Запуск и снятие — в предохранителе:
// исключение помечает только эту секцию — data-merfy-state="failed" и inert (её кнопки неактивны), соседи работают,
// запись уходит событием merfy:section-error. Живая секция — data-merfy-state="mounted"; атрибута нет — секция ещё не
// запущена или у неё нет скрипта (п. 16: скрипт не обязателен).
export type SectionState = 'mounted' | 'failed';
export const NAME_ATTRIBUTE = 'data-section';
export const STATE_ATTRIBUTE = 'data-merfy-state';

export type Outcome = { ok: true } | { ok: false; error: unknown };

interface Loaded {
  definition: SectionDefinition;
  src: string;
}

interface State {
  target: EventTarget;
  loaded: Map<string, Loaded>;
  failed: Map<string, SectionFailure>;
  elements: Set<HTMLElement>;
}

export interface SectionRegistry {
  // Элемент появился на странице: определение есть — запустить; секция уже «не ожила» — пометить.
  connect: (element: HTMLElement) => Promise<void>;
  // Элемент ушёл со страницы: живой — снять.
  disconnect: (element: HTMLElement) => Promise<void>;
  // Модуль секции загружен: запомнить определение и запустить её элементы, которые ещё не живые.
  define: (name: string, definition: SectionDefinition, src: string) => Promise<void>;
  // Модуль не загрузился, определения в нём нет или код упал после запуска: все элементы секции — «не ожила».
  fail: (name: string, stage: FailureStage, error: unknown, src?: string) => void;
  has: (name: string) => boolean;
  // Шаги замены кода в превью (С7-22 В, preview.ts).
  elementsOf: (name: string) => HTMLElement[];
  saveState: (element: HTMLElement) => unknown;
  stop: (element: HTMLElement) => Promise<void>;
  adopt: (name: string, definition: SectionDefinition | null, src: string | null) => void;
  tryStart: (element: HTMLElement, carried: unknown) => Promise<Outcome>;
  failElement: (element: HTMLElement, stage: FailureStage, error: unknown) => void;
}

const nameOf = (element: HTMLElement): string => element.getAttribute(NAME_ATTRIBUTE) ?? '';
const stateOf = (element: HTMLElement): string | null => element.getAttribute(STATE_ATTRIBUTE);

function setState(element: HTMLElement, state: SectionState | null): void {
  if (state === null) element.removeAttribute(STATE_ATTRIBUTE);
  if (state !== null) element.setAttribute(STATE_ATTRIBUTE, state);
  element.toggleAttribute('inert', state === 'failed');
}

async function guarded(work: () => void | Promise<void>): Promise<Outcome> {
  try {
    await work();
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

function keep(work: () => unknown): unknown {
  try {
    return work();
  } catch {
    return undefined;
  }
}

const elementsOf = (state: State, name: string): HTMLElement[] =>
  [...state.elements].filter((element) => nameOf(element) === name);

function report(state: State, name: string, stage: FailureStage, error: unknown, src?: string): SectionFailure {
  const failure = { section: name, src: src ?? state.loaded.get(name)?.src ?? '', stage, message: messageOf(error) };
  reportFailure(state.target, failure);
  return failure;
}

function failElement(state: State, element: HTMLElement, stage: FailureStage, error: unknown): void {
  setState(element, 'failed');
  report(state, nameOf(element), stage, error);
}

async function tryStart(state: State, element: HTMLElement, carried: unknown): Promise<Outcome> {
  const name = nameOf(element);
  const loaded = state.loaded.get(name);
  if (loaded === undefined) return { ok: true };
  const outcome = await guarded(() => loaded.definition.mount(element, { name, state: carried }));
  if (outcome.ok) setState(element, 'mounted');
  return outcome;
}

async function start(state: State, element: HTMLElement): Promise<void> {
  const outcome = await tryStart(state, element, undefined);
  if (!outcome.ok) failElement(state, element, 'mount', outcome.error);
}

async function connect(state: State, element: HTMLElement): Promise<void> {
  state.elements.add(element);
  const name = nameOf(element);
  if (state.failed.has(name)) return setState(element, 'failed');
  if (state.loaded.has(name)) await start(state, element);
}

async function stop(state: State, element: HTMLElement): Promise<void> {
  if (stateOf(element) !== 'mounted') return;
  setState(element, null);
  const loaded = state.loaded.get(nameOf(element));
  const outcome = await guarded(() => loaded?.definition.unmount?.(element));
  if (!outcome.ok) report(state, nameOf(element), 'unmount', outcome.error);
}

async function disconnect(state: State, element: HTMLElement): Promise<void> {
  state.elements.delete(element);
  await stop(state, element);
}

function adopt(state: State, name: string, definition: SectionDefinition | null, src: string | null): void {
  state.failed.delete(name);
  if (definition === null || src === null) state.loaded.delete(name);
  if (definition !== null && src !== null) state.loaded.set(name, { definition, src });
}

async function define(state: State, name: string, definition: SectionDefinition, src: string): Promise<void> {
  adopt(state, name, definition, src);
  const idle = elementsOf(state, name).filter((element) => stateOf(element) !== 'mounted');
  await Promise.all(idle.map((element) => start(state, element)));
}

// Запись о сбое — одна на секцию: ошибка в таймере или обработчике повторяется, журнал автора ею не заваливаем.
function fail(state: State, name: string, stage: FailureStage, error: unknown, src?: string): void {
  if (state.failed.has(name)) return;
  state.failed.set(name, report(state, name, stage, error, src));
  elementsOf(state, name).forEach((element) => setState(element, 'failed'));
}

// Состояние у живой секции для её новой версии (С7-22 В). Нет saveState или он упал — undefined: новая версия
// стартует с нуля, это не сбой.
function saveState(state: State, element: HTMLElement): unknown {
  const loaded = state.loaded.get(nameOf(element));
  if (stateOf(element) !== 'mounted' || loaded === undefined) return undefined;
  return keep(() => loaded.definition.saveState?.(element));
}

export function createRegistry(target: EventTarget): SectionRegistry {
  const state: State = { target, loaded: new Map(), failed: new Map(), elements: new Set() };
  return {
    connect: (element) => connect(state, element),
    disconnect: (element) => disconnect(state, element),
    define: (name, definition, src) => define(state, name, definition, src),
    fail: (name, stage, error, src) => fail(state, name, stage, error, src),
    has: (name) => state.loaded.has(name),
    elementsOf: (name) => elementsOf(state, name),
    saveState: (element) => saveState(state, element),
    stop: (element) => stop(state, element),
    adopt: (name, definition, src) => adopt(state, name, definition, src),
    tryStart: (element, carried) => tryStart(state, element, carried),
    failElement: (element, stage, error) => failElement(state, element, stage, error),
  };
}
