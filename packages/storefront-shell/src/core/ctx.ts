import { ShellError } from '../errors';
import type { AnimateProvider } from './behaviors/types';
import type { ElScope } from './el';
import type { EventBus } from './events';
import type { Guard } from './guard';
import { checkKeyframes } from './keyframes';
import type { SectionInput } from './input';
import { sectionLog } from './log';
import { createSectionStorage, type KeyValue } from './storage';
import { watchSource } from './stores';
import type { BaseCtx, El, EventDetail, EventName, Json, Mode, ReadableStore, SectionEvent, Stop } from './types';

// ctx экземпляра (design.md блока 5, раздел 3.2): имя, id, режим, входные данные, адрес страницы, своё хранилище,
// таймеры и подписки на одном сигнале экземпляра. Объект заморожен; state — свойство-аксессор, свой у каждого экземпляра.

export interface CtxDeps {
  readonly win: Window;
  readonly bus: EventBus;
  readonly owner: object;
  readonly scope: ElScope;
  readonly run: Guard;
  readonly signal: AbortSignal;
  readonly page: KeyValue;
  readonly name: string;
  readonly id: string;
  readonly mode: Mode;
  readonly input: SectionInput;
  readonly animate: AnimateProvider | null; // провайдер части behaviors (блок 6); нет — ctx.animate бросает part-unknown
}

const DOM_EVENTS: ReadonlySet<string> = new Set(['keydown', 'keyup', 'scroll', 'resize', 'pointerdown']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const pageOf = (win: Window) =>
  Object.freeze({
    path: win.location.pathname,
    query: Object.freeze(Object.fromEntries(new URLSearchParams(win.location.search))),
  });

// Событие страницы для кода секции: замороженная копия с проверкой «изнутри ли элемент».
const sectionEventOf = (event: Event, scope: ElScope): SectionEvent => {
  const target: EventTarget | null = event.target;
  return Object.freeze({
    type: event.type,
    key: event instanceof KeyboardEvent ? event.key : null,
    inside(el: El): boolean {
      const node = scope.nodeOf(el);
      return node !== null && target instanceof Node && node.contains(target);
    },
    preventDefault: (): void => event.preventDefault(),
  });
};

const onOf =
  (win: Window, scope: ElScope, run: Guard, signal: AbortSignal): BaseCtx<Record<string, unknown>>['on'] =>
  (target, type, fn) => {
    const known = DOM_EVENTS.has(type) && (target === 'window' || target === 'document');
    if (!known) {
      throw new ShellError(
        'sdk-call-invalid',
        `ctx.on(${target}, ${type}): только страница целиком — window или document`,
      );
    }
    const node: EventTarget = target === 'window' ? win : win.document;
    const listener = (event: Event): void => void run('runtime', () => fn(sectionEventOf(event, scope)));
    node.addEventListener(type, listener, { signal });
    return () => node.removeEventListener(type, listener);
  };

const stopWithSignal = (stop: Stop, signal: AbortSignal): Stop => {
  if (signal.aborted) {
    stop();
    return () => undefined;
  }
  signal.addEventListener('abort', stop, { once: true });
  return stop;
};

const everyOf =
  (win: Window, run: Guard, signal: AbortSignal): BaseCtx<Record<string, unknown>>['every'] =>
  (ms, fn) => {
    const timer = win.setInterval(() => void run('runtime', fn), Math.max(ms, 100));
    return stopWithSignal(() => win.clearInterval(timer), signal);
  };

const afterOf =
  (win: Window, run: Guard, signal: AbortSignal): BaseCtx<Record<string, unknown>>['after'] =>
  (ms, fn) => {
    const timer = win.setTimeout(() => void run('runtime', fn), ms);
    return stopWithSignal(() => win.clearTimeout(timer), signal);
  };

const watchOf =
  (run: Guard, signal: AbortSignal): BaseCtx<Record<string, unknown>>['watch'] =>
  <T>(store: ReadableStore<T>, fn: (value: T) => void) => {
    const source = watchSource(store);
    if (source === null) throw new ShellError('sdk-call-invalid', 'ctx.watch: стор — из модулей SDK по uses');
    const stop = source.listen((value) => void run('runtime', () => fn(value)));
    run('runtime', () => fn(store.get()));
    return stopWithSignal(stop, signal);
  };

// Форма детали события по имени (раздел 3.2): шина стирает типы, здесь детали каталога проверяются, чужая форма — мимо.
const DETAIL_TEXTS: Readonly<Record<EventName, readonly string[]>> = {
  'merfy:page:ready': [],
  'merfy:page:view': ['path'],
  'merfy:page:hidden': [],
  'merfy:page:visible': [],
  'merfy:page:restore': [],
  'merfy:page:leave': [],
  'merfy:section:mount': ['section'],
  'merfy:section:error': ['section', 'id', 'script', 'stage', 'message'],
};

function isDetail<E extends EventName>(name: E, detail: unknown): detail is EventDetail<E> {
  if (!isRecord(detail)) return false;
  return DETAIL_TEXTS[name].every((key) => typeof detail[key] === 'string');
}

const listenOf =
  (bus: EventBus, owner: object, run: Guard, signal: AbortSignal): BaseCtx<Record<string, unknown>>['listen'] =>
  <E extends EventName>(name: E, fn: (detail: EventDetail<E>) => void) => {
    const stop = bus.listen(name, owner, (detail) => {
      if (!isDetail(name, detail)) return; // чужое событие нестандартной формы — не для этой секции
      void run('runtime', () => fn(detail));
    });
    return stopWithSignal(stop, signal);
  };

const methodsOf = (deps: CtxDeps, signal: AbortSignal) => ({
  ref: (refName: string) => deps.scope.ref(refName),
  refs: (refName: string) => deps.scope.refs(refName),
  on: onOf(deps.win, deps.scope, deps.run, signal),
  every: everyOf(deps.win, deps.run, signal),
  after: afterOf(deps.win, deps.run, signal),
  watch: watchOf(deps.run, signal),
  listen: listenOf(deps.bus, deps.owner, deps.run, signal),
  emit: (emitName: string, detail?: Json): void => deps.bus.emit(`${deps.name}:${emitName}`, detail ?? null),
  log: (...values: unknown[]) => sectionLog(deps.mode, deps.name, deps.id, values),
  animate: animateOf(deps),
});

// ctx.animate (блок 6, design.md раздел 10): узел — только своей секции, кадры — из списка, провайдер — часть behaviors.
function animateOf(deps: CtxDeps): BaseCtx<Record<string, unknown>>['animate'] {
  return (el, keyframes, options) => {
    const node = deps.scope.nodeOf(el);
    if (node === null) throw new ShellError('sdk-call-invalid', 'ctx.animate: элемент не из этой секции');
    checkKeyframes(keyframes);
    if (deps.animate === null)
      throw new ShellError('part-unknown', 'ctx.animate: на странице нет кода анимаций — пересоберите страницу');
    return deps.animate(node, keyframes, options, deps.signal, deps.mode);
  };
}

export function createCtx(deps: CtxDeps, modules: Readonly<Record<string, unknown>>): BaseCtx<Record<string, unknown>> {
  let state: Partial<Record<string, unknown>> = {};
  const ctx: BaseCtx<Record<string, unknown>> & Record<string, unknown> = {
    name: deps.name,
    id: deps.id,
    mode: deps.mode,
    settings: deps.input.settings,
    blocks: deps.input.blocks,
    data: deps.input.data,
    page: pageOf(deps.win),
    signal: deps.signal,
    storage: createSectionStorage(deps.name, deps.page),
    ...methodsOf(deps, deps.signal),
    get state(): Partial<Record<string, unknown>> {
      return state; // свой объект экземпляра; ctx заморожен, а аксессор — работает
    },
    set state(next: Partial<Record<string, unknown>>) {
      if (typeof next === 'object' && next !== null) state = next;
    },
  };
  Object.assign(ctx, modules);
  return Object.freeze(ctx);
}
