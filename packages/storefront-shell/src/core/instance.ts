import { messageOf } from '../report';
import { listenActions } from './actions';
import type { AnimateProvider, BehaviorsApi } from './behaviors/types';
import { createElScope, type ElScope } from './el';
import { SECTION_FAILURE_EVENT, type EventBus } from './events';
import { createGuard, type Guard } from './guard';
import { createCtx, type CtxDeps } from './ctx';
import { EXT_USE_PREFIX } from './ext-registry';
import { readSectionInput, type SectionInput } from './input';
import { STORE_USE_PREFIX } from './own-stores';
import type { OverlayApi } from './parts/overlay';
import { OVERLAY_ATTRIBUTE, OVERLAY_PART } from './roles';
import type { KeyValue } from './storage';
import type {
  BaseCtx,
  FailureStage,
  InstanceHost,
  Mode,
  OverlayWindow,
  Result,
  SectionEntry,
  SectionEvent,
  SectionFailureDetail,
  ThemeSettings,
} from './types';

// Запуск и снятие экземпляра секции (design.md блока 5, разделы 3.6 и 3.7): входные данные, ctx, attach частей до
// mount, предохранитель на весь код секции, сбой — на экземпляр. Экземпляр есть и у секции без скрипта с разметкой SDK.

// Разметка SDK без скрипта секции (раздел 3.6, шаг 2): действие части с точкой, готовое поведение, анимация; окно поверх
// страницы (01.11) — его открывает выбор в превью и у секции без скрипта.
export const SDK_MARKUP_SELECTOR = `[data-action*="."], [data-behavior], [data-animate], [${OVERLAY_ATTRIBUTE}]`;

// Действие части в разметке, привязанное к API созданной части (сами слушатели — задача 5а-5, actions.ts).
export interface MarkupCall {
  readonly params: readonly string[];
  call(values: Readonly<Record<string, string>>, event?: SectionEvent, section?: HTMLElement): Promise<Result<unknown>>;
}

// Стартовое окружение экземпляров одной страницы: окно, шина, хранилище, части.
export interface InstanceRuntime {
  readonly win: Window;
  readonly mode: Mode;
  readonly bus: EventBus;
  readonly page: KeyValue;
  partApi(name: string): unknown; // нет такой части — ShellError part-unknown
  apiOfPart(name: string): unknown; // API созданной части платформы; части нет — null; секциям не отдаётся
  attachAll(host: InstanceHost): void; // attach частей с их API; ошибка в части — строка в консоли
  markup(name: string): MarkupCall | null; // 'cart.add' → действие add части cart
  readonly theme: Readonly<ThemeSettings>; // ctx.theme: один замороженный объект на страницу (блок 9, часть 9б)
}

export interface Instance {
  readonly element: HTMLElement;
  readonly name: string;
  readonly id: string;
  readonly script: string;
  readonly owner: object; // владелец подписок шины: тем же объектом ядро доставляет события страницы новому экземпляру
  // Запуск закончился (часть 5г, замена в превью): null — mount выполнился; текст — сбой при запуске или снятие до него.
  readonly settled: Promise<string | null>;
  currentState(): unknown; // ctx.state экземпляра: замена в превью переносит его копию в новый экземпляр
  teardown(): void; // элемент ушёл из документа или ядро остановлено: abort и unmount через предохранитель
}

interface InstanceState {
  readonly element: HTMLElement;
  readonly name: string;
  readonly id: string;
  readonly entry: SectionEntry | null;
  readonly controller: AbortController;
  readonly scope: ElScope;
  readonly runtime: InstanceRuntime;
  readonly failed: { value: boolean };
  readonly finished: { value: boolean };
  readonly initial: Readonly<Record<string, unknown>> | undefined; // начальный ctx.state (замена в превью, часть 5г)
  readonly settle: (message: string | null) => void; // решает settled; решает первый вызов, остальные ничего не меняют
  readonly settled: Promise<string | null>;
  ctx: BaseCtx<Record<string, unknown>> | null;
  run: Guard;
}

const disableActions = (root: HTMLElement): void => {
  root.querySelectorAll('[data-action]').forEach((node) => node.setAttribute('aria-disabled', 'true'));
};

// Сбой экземпляра (раздел 3.7): снимает без unmount, помечает failed, кнопки с data-action — aria-disabled, ссылки и
// <details> секции продолжают работать.
// Одна запись на экземпляр: первые ошибки после сбоя и снятия не записываются.
function reportFailure(
  state: InstanceState,
  teardown: (withUnmount: boolean) => void,
  stage: FailureStage,
  error: unknown,
): void {
  if (state.failed.value) return;
  state.failed.value = true;
  const message = messageOf(error);
  state.settle(message); // до снятия: снятие решило бы settled текстом «снят до запуска»
  teardown(false);
  const detail: SectionFailureDetail = {
    section: state.name,
    id: state.id,
    script: state.entry?.script ?? '',
    stage,
    message,
  };
  if (stage !== 'unmount') {
    state.element.setAttribute('data-merfy-state', 'failed');
    disableActions(state.element);
  }
  state.runtime.bus.emit(SECTION_FAILURE_EVENT, detail);
  console.error(`Сбой секции ${state.name}#${state.id} (${stage}): ${message}`);
}

// Снят до конца mount — settled с этим текстом (часть 5г): замена в превью не ждёт запуска, которого не будет.
const SETTLED_BEFORE_MOUNT = 'экземпляр снят до запуска';

// Сбой пришёл готовым из HTML: settled — с текстом сбоя, как у сбоя до запуска.
const FAILED_FROM_HTML = 'секция пришла на страницу с признаком сбоя (data-merfy-state="failed")';

// Секция из HTML с data-merfy-state="failed" (блок 12, решение основного треда 25.10, 21:50): то же, что reportFailure,
// но без события SECTION_FAILURE_EVENT и строки в консоли — сбой уже случился на сервере. Признак на элементе остаётся.
function failFromHtml(state: InstanceState, teardown: (withUnmount: boolean) => void): Instance {
  state.settle(FAILED_FROM_HTML);
  teardown(false);
  disableActions(state.element);
  return finishOf(state, teardown);
}

function teardownOf(state: InstanceState, withUnmount: boolean): void {
  if (state.finished.value) return;
  state.finished.value = true;
  state.settle(SETTLED_BEFORE_MOUNT); // mount выполнился раньше — settled уже решён, вызов ничего не меняет
  state.controller.abort();
  const definition = state.entry?.definition;
  const ctx = state.ctx;
  if (withUnmount && definition?.unmount !== undefined && ctx !== null && !state.failed.value) {
    state.run('unmount', () => definition.unmount?.(state.scope.wrap(state.element), ctx));
  }
}

const markMounted = (state: InstanceState): void => {
  if (state.finished.value || state.failed.value) return;
  state.element.setAttribute('data-merfy-state', 'mounted');
  state.runtime.bus.emit('merfy:section:mount', { section: state.name });
  state.settle(null);
};

// mount через предохранитель; закончившееся обещание — событие секции:mount, когда выполнилось (раздел 3.6, шаг 3).
function runMount(state: InstanceState): void {
  const ctx = state.ctx;
  const definition = state.entry?.definition;
  if (ctx === null) return;
  const outcome = state.run('mount', () =>
    definition?.mount === undefined ? undefined : definition.mount(state.scope.wrap(state.element), ctx),
  );
  if (outcome instanceof Promise)
    void outcome.then(
      () => markMounted(state),
      () => markMounted(state),
    );
  else markMounted(state);
}

const NO_PART = Symbol('no-part');

// API части по имени из uses; части нет — сбой стадии mount.
function partOf(state: InstanceState, use: string): unknown {
  try {
    return state.runtime.partApi(use);
  } catch (error) {
    reportFailure(state, (withUnmount) => teardownOf(state, withUnmount), 'mount', error);
    return NO_PART;
  }
}

// Модули по uses (11г А): части нет — сбой стадии mount, код секции не вызывается. "ext:<id>" — в ctx.ext.<id> (блок 9,
// часть 9в), "store:<префикс>:<имя>" — в ctx.stores (свои сторы); ctx.ext и ctx.stores есть у каждой секции, без таких
// uses — пустые.
function modulesOf(state: InstanceState): Record<string, unknown> | null {
  const modules: Record<string, unknown> = {};
  const ext: Record<string, unknown> = {};
  const stores: Record<string, unknown> = {};
  for (const use of state.entry?.uses ?? []) {
    const api = partOf(state, use);
    if (api === NO_PART) return null;
    if (use.startsWith(EXT_USE_PREFIX)) ext[use.slice(EXT_USE_PREFIX.length)] = api;
    else if (use.startsWith(STORE_USE_PREFIX)) stores[use.slice(STORE_USE_PREFIX.length)] = api;
    else modules[use] = api;
  }
  return { ...modules, ext: Object.freeze(ext), stores: Object.freeze(stores) };
}

function stateOf(
  runtime: InstanceRuntime,
  element: HTMLElement,
  entry: SectionEntry | null,
  initial: Readonly<Record<string, unknown>> | undefined,
): InstanceState {
  const name = element.getAttribute('data-section') ?? '';
  const controller = new AbortController();
  const settling = settlingOf();
  return {
    element,
    name,
    id: element.getAttribute('data-section-id') ?? name,
    entry,
    controller,
    scope: createElScope(element, controller.signal),
    runtime,
    // Блок 12 (решение основного треда 25.10, 21:50): секция пришла в HTML уже с признаком сбоя — сбой случился на
    // сервере, экземпляр не запускается.
    failed: { value: element.getAttribute('data-merfy-state') === 'failed' },
    finished: { value: false },
    initial,
    settle: settling.settle,
    settled: settling.settled,
    ctx: null,
    run: () => undefined,
  };
}

// Обещание итога запуска и функция, которая его решает.
function settlingOf(): { settle: (message: string | null) => void; settled: Promise<string | null> } {
  let settle: (message: string | null) => void = () => undefined;
  const settled = new Promise<string | null>((resolve) => {
    settle = resolve;
  });
  return { settle, settled };
}

// Слушатели действий разметки (раздел 3.4): на тип события — один слушатель на корне секции.
function listenActionsOf(runtime: InstanceRuntime, state: InstanceState, ctx: BaseCtx<Record<string, unknown>>): void {
  listenActions({
    root: state.element,
    scope: state.scope,
    ctx,
    actions: state.entry?.definition.actions ?? {},
    markup: (name: string) => runtime.markup(name),
    signal: state.controller.signal,
    run: (work: () => unknown): unknown => state.run('runtime', work),
  });
}

// API части behaviors (блок 6): провайдер ctx.animate и команды ctx.behavior (03.11); части нет — null.
const behaviorsOf = (runtime: InstanceRuntime): Partial<BehaviorsApi> | null => {
  const api = runtime.apiOfPart('behaviors');
  return typeof api === 'object' && api !== null ? api : null;
};

// Провайдер ctx.animate — поле animate; нет части или поля — null.
const animateOfPart = (runtime: InstanceRuntime): AnimateProvider | null => {
  const api = behaviorsOf(runtime);
  return api?.animate ?? null;
};

// ctx.behavior — поле control, привязанное к экземпляру: команды поведений его разметки, поведение — только этой секции.
// Элемент — из области секции: чужой (nodeOf даёт null) часть отказывает с текстом; без элемента поведение ищется одно
// (undefined). Нет части или поля — Error: ни у одной секции страницы нет data-behavior.
function behaviorOfPart(runtime: InstanceRuntime, state: InstanceState): CtxDeps['behavior'] {
  const api = behaviorsOf(runtime);
  const section = { element: state.element, id: state.id, signal: state.controller.signal };
  return (name, el) => {
    if (!api?.control) throw new Error('ctx.behavior: нет data-behavior');
    return api.control(section, name, el === undefined ? undefined : state.scope.nodeOf(el));
  };
}

// Окна поверх страницы (01.11) — часть overlay: в бандле только страниц с такой секцией, поэтому здесь — только её тип.
const isOverlayApi = (value: unknown): value is OverlayApi =>
  typeof value === 'object' && value !== null && 'windowOf' in value && typeof value.windowOf === 'function';

// ctx.overlay — у части overlay по узлу экземпляра; части нет на странице или это не окно поверх страницы — null.
function overlayOfPart(runtime: InstanceRuntime, state: InstanceState): OverlayWindow | null {
  const api = runtime.apiOfPart(OVERLAY_PART);
  if (!isOverlayApi(api)) return null;
  return api.windowOf({
    element: state.element,
    name: state.name,
    id: state.id,
    mode: runtime.mode,
    signal: state.controller.signal,
  });
}

const ctxDepsOf = (runtime: InstanceRuntime, state: InstanceState, input: SectionInput): CtxDeps => ({
  win: runtime.win,
  bus: runtime.bus,
  owner: state,
  scope: state.scope,
  run: state.run,
  signal: state.controller.signal,
  page: runtime.page,
  theme: runtime.theme,
  name: state.name,
  id: state.id,
  mode: runtime.mode,
  input,
  animate: animateOfPart(runtime),
  split: behaviorsOf(runtime)?.split ?? null,
  pointer: behaviorsOf(runtime)?.pointer ?? null,
  behavior: behaviorOfPart(runtime, state),
  overlay: overlayOfPart(runtime, state),
  state: state.initial,
});

// ctx, attach частей до mount и сам mount (раздел 3.6, шаг 4).
function launchOf(
  runtime: InstanceRuntime,
  state: InstanceState,
  input: SectionInput,
  modules: Record<string, unknown>,
): void {
  const ctx = createCtx(ctxDepsOf(runtime, state, input), modules);
  state.ctx = ctx;
  listenActionsOf(runtime, state, ctx);
  runtime.attachAll({
    element: state.element,
    name: state.name,
    id: state.id,
    mode: runtime.mode,
    signal: state.controller.signal,
  });
  runMount(state);
}

// initial — начальный ctx.state: копия состояния прежнего экземпляра при замене в превью (часть 5г).
export function startInstance(
  runtime: InstanceRuntime,
  element: HTMLElement,
  entry: SectionEntry | null,
  initial?: Readonly<Record<string, unknown>>,
): Instance {
  const state = stateOf(runtime, element, entry, initial);
  const teardown = (withUnmount: boolean): void => teardownOf(state, withUnmount);
  state.run = createGuard((stage, error) => reportFailure(state, teardown, stage, error));
  if (state.failed.value) return failFromHtml(state, teardown);

  let input: SectionInput;
  try {
    input = readSectionInput(element);
  } catch (error) {
    reportFailure(state, teardown, 'mount', error); // битый тег: HTML на месте, mount не вызывается
    return finishOf(state, teardown);
  }
  const modules = modulesOf(state);
  if (modules === null) return finishOf(state, teardown);
  launchOf(runtime, state, input, modules);
  return finishOf(state, teardown);
}

const finishOf = (state: InstanceState, teardown: (withUnmount: boolean) => void): Instance => ({
  element: state.element,
  name: state.name,
  id: state.id,
  script: state.entry?.script ?? '',
  owner: state,
  settled: state.settled,
  currentState: () => state.ctx?.state ?? null,
  teardown: () => teardown(true),
});
