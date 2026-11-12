import { ShellError } from '../errors';
import type { AnimateProvider, PointerProvider, SplitProvider } from './behaviors/types';
import type { ElScope } from './el';
import type { EventBus } from './events';
import type { Guard } from './guard';
import type { SectionInput } from './input';
import { sectionLog } from './log';
import { pageInfoOf } from './page-info';
import { createSectionStorage, type KeyValue } from './storage';
import { watchSource } from './stores';
import type {
  BaseCtx,
  El,
  EventDetail,
  EventName,
  ExtModule,
  Json,
  Mode,
  OverlayWindow,
  PageDomEvent,
  PointerSectionEvent,
  ReadableStore,
  SectionEvent,
  SplitBy,
  Stop,
  StoreCtx,
  ThemeSettings,
} from './types';

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
  readonly theme: Readonly<ThemeSettings>; // сквозные настройки темы страницы (блок 9, часть 9б)
  readonly input: SectionInput;
  readonly animate: AnimateProvider | null; // провайдер части behaviors (блок 6); нет — ctx.animate бросает part-unknown
  readonly split?: SplitProvider | null; // 12.11: то же для ctx.split
  readonly pointer?: PointerProvider | null; // 12.11: то же для ctx.on(…, 'pointermove')
  // 03.11: ctx.behavior — команды поведений этой секции, их выбирает часть behaviors (instance.ts привязывает её к
  // экземпляру); нельзя — Error с текстом для автора.
  readonly behavior: BaseCtx<Record<string, unknown>>['behavior'];
  readonly overlay?: OverlayWindow | null; // 01.11, устарело: окно секции поверх страницы (часть overlay ядра); нет — null
  readonly state?: Readonly<Record<string, unknown>>; // начальный ctx.state — копия при замене в превью (часть 5г)
}

const DOM_EVENTS: ReadonlySet<string> = new Set(['keydown', 'keyup', 'scroll', 'resize', 'pointerdown', 'pointermove']);
// ctx.ext без модулей расширений (блок 9, часть 9в): модули по uses ставит instance.ts поверх.
const NO_EXT: Readonly<Record<string, ExtModule>> = Object.freeze({});
// ctx.stores без своих сторов: сторы по uses ["store:…"] ставят поверх instance.ts и own-stores.ts.
const NO_STORES: Readonly<Record<string, ReadableStore<Json>>> = Object.freeze({});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

// Обработчик ctx.on: SectionEvent или (у pointermove) PointerSectionEvent.
type Listener = (event: PointerSectionEvent) => void;

// pointermove (12.11) ведёт провайдер части behaviors: раз в кадр и с координатами курсора.
function onOf(
  win: Window,
  scope: ElScope,
  run: Guard,
  signal: AbortSignal,
  pointer: PointerProvider | null | undefined,
): BaseCtx<Record<string, unknown>>['on'] {
  return (target: 'window' | 'document', type: PageDomEvent, fn: Listener): Stop => {
    const known = DOM_EVENTS.has(type) && (target === 'window' || target === 'document');
    if (!known) {
      throw new ShellError(
        'sdk-call-invalid',
        `ctx.on(${target}, ${type}): только страница целиком — window или document`,
      );
    }
    const node: EventTarget = target === 'window' ? win : win.document;
    // У pointermove к SectionEvent добавлены pointer и at — их даёт провайдер (extra). Reflect.apply: типы fn у разных
    // событий разные, а приведения типов в пакете запрещены.
    const call = (event: Event, extra?: object): void =>
      void run('runtime', () => Reflect.apply(fn, undefined, [{ ...sectionEventOf(event, scope), ...extra }]));
    if (type === 'pointermove') {
      return need(pointer, 'on')(node, scope, call, signal);
    }
    const listener = (event: Event): void => call(event);
    node.addEventListener(type, listener, { signal });
    return () => node.removeEventListener(type, listener);
  };
}

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

// События merfy:* в шину отправляет только ядро и части SDK (CoreHandle.emit, типы EventMap); ctx.emit секции добавляет к
// имени имя секции. На витрине данные событий не проверяем (блок 9, «Решил сам» п. 11).
function isDetail<E extends EventName>(_name: E, detail: unknown): detail is EventDetail<E> {
  return isRecord(detail);
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
  on: onOf(deps.win, deps.scope, deps.run, signal, deps.pointer),
  every: everyOf(deps.win, deps.run, signal),
  after: afterOf(deps.win, deps.run, signal),
  watch: watchOf(deps.run, signal),
  listen: listenOf(deps.bus, deps.owner, deps.run, signal),
  emit: (emitName: string, detail?: Json): void => deps.bus.emit(`${deps.name}:${emitName}`, detail ?? null),
  log: (...values: unknown[]) => sectionLog(deps.mode, deps.name, deps.id, values),
  animate: animateOf(deps),
  split: splitOf(deps),
  behavior: deps.behavior,
});

// ctx.animate и ctx.split (блок 6, design.md раздел 10): узлы — только своей секции, кадры проверяет и Motion подаёт часть
// behaviors (12.11: проверка кадров переехала туда — ядро стоит в бюджете веса). Свой узел или сбой sdk-call-invalid.
function ownNode(deps: CtxDeps, call: string, el: El): Element {
  const node = deps.scope.nodeOf(el);
  if (node === null) throw new ShellError('sdk-call-invalid', `ctx.${call}: элемент не из этой секции`);
  return node;
}

// Провайдер части behaviors: нет — сбой part-unknown с текстом для автора секции.
function need<T>(provider: T | null | undefined, call: string): T {
  if (!provider)
    throw new ShellError('part-unknown', `ctx.${call}: на странице нет кода анимаций — пересоберите страницу`);
  return provider;
}

function animateOf(deps: CtxDeps): BaseCtx<Record<string, unknown>>['animate'] {
  return (el, keyframes, options) => {
    const nodes = [el].flat().map((item) => ownNode(deps, 'animate', item));
    return need(deps.animate, 'animate')(nodes, keyframes, options, deps.signal, deps.mode);
  };
}

function splitOf(deps: CtxDeps): BaseCtx<Record<string, unknown>>['split'] {
  function split(el: El, by: 'chars' | 'words'): readonly El[];
  function split(el: El, by: 'lines'): Promise<readonly El[]>;
  function split(el: El, by: SplitBy): readonly El[] | Promise<readonly El[]> {
    const node = ownNode(deps, 'split', el);
    const wrap = (nodes: readonly HTMLElement[]): readonly El[] => nodes.map((item) => deps.scope.wrap(item));
    const pieces = need(deps.split, 'split')(node, by, deps.signal);
    return pieces instanceof Promise ? pieces.then(wrap) : wrap(pieces);
  }
  return split;
}

export function createCtx(deps: CtxDeps, modules: Readonly<Record<string, unknown>>): BaseCtx<Record<string, unknown>> {
  let state: Partial<Record<string, unknown>> = { ...deps.state }; // свой объект экземпляра, начало — копия при замене
  const ctx: BaseCtx<Record<string, unknown>> & Record<string, unknown> = {
    name: deps.name,
    id: deps.id,
    mode: deps.mode,
    settings: deps.input.settings,
    blocks: deps.input.blocks,
    data: deps.input.data,
    page: pageInfoOf(deps.win),
    signal: deps.signal,
    storage: createSectionStorage(deps.name, deps.page),
    ext: NO_EXT,
    stores: NO_STORES,
    theme: deps.theme,
    overlay: deps.overlay ?? null,
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

// ctx своего стора (свои сторы): те же таймеры, подписки, события и хранилище на сигнале стора, без элементов и
// входных данных секции. События стора уходят как '<имя стора>:<name>', хранилище — merfy:s:<имя стора>:<ключ>.
export type StoreCtxDeps = Pick<
  CtxDeps,
  'win' | 'bus' | 'owner' | 'run' | 'signal' | 'page' | 'name' | 'mode' | 'theme'
>;

export function createStoreCtx(deps: StoreCtxDeps, modules: Readonly<Record<string, unknown>>): StoreCtx<never> {
  const ctx: StoreCtx<never> & Record<string, unknown> = {
    name: deps.name,
    mode: deps.mode,
    page: pageInfoOf(deps.win),
    signal: deps.signal,
    storage: createSectionStorage(deps.name, deps.page),
    ext: NO_EXT,
    stores: NO_STORES,
    theme: deps.theme,
    every: everyOf(deps.win, deps.run, deps.signal),
    after: afterOf(deps.win, deps.run, deps.signal),
    watch: watchOf(deps.run, deps.signal),
    listen: listenOf(deps.bus, deps.owner, deps.run, deps.signal),
    emit: (emitName: string, detail?: Json): void => deps.bus.emit(`${deps.name}:${emitName}`, detail ?? null),
    log: (...values: unknown[]) => sectionLog(deps.mode, deps.name, deps.name, values),
  };
  Object.assign(ctx, modules);
  return Object.freeze(ctx);
}
