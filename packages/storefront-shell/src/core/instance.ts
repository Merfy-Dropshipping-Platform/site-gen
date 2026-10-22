import { messageOf } from '../report';
import { listenActions } from './actions';
import type { AnimateProvider } from './behaviors/types';
import { createElScope, type ElScope } from './el';
import { SECTION_FAILURE_EVENT, type EventBus } from './events';
import { createGuard, type Guard } from './guard';
import { createCtx, type CtxDeps } from './ctx';
import { readSectionInput, type SectionInput } from './input';
import type { KeyValue } from './storage';
import type { BaseCtx, FailureStage, InstanceHost, Mode, Result, SectionEntry, SectionFailureDetail } from './types';

// Запуск и снятие экземпляра секции (design.md блока 5, разделы 3.6 и 3.7): входные данные, ctx, attach частей до
// mount, предохранитель на весь код секции, сбой — на экземпляр. Экземпляр есть и у секции без скрипта с разметкой SDK.

// Разметка SDK без скрипта секции (раздел 3.6, шаг 2): действие части с точкой, готовое поведение, анимация.
export const SDK_MARKUP_SELECTOR = '[data-action*="."], [data-behavior], [data-animate]';

// Действие части в разметке, привязанное к API созданной части (сами слушатели — задача 5а-5, actions.ts).
export interface MarkupCall {
  readonly params: readonly string[];
  call(values: Readonly<Record<string, string>>): Promise<Result<unknown>>;
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
}

export interface Instance {
  readonly element: HTMLElement;
  readonly name: string;
  readonly id: string;
  readonly script: string;
  readonly owner: object; // владелец подписок шины: тем же объектом ядро доставляет события страницы новому экземпляру
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
  teardown(false);
  const message = messageOf(error);
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

function teardownOf(state: InstanceState, withUnmount: boolean): void {
  if (state.finished.value) return;
  state.finished.value = true;
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

// Модули по uses (11г А): части нет — сбой стадии mount, код секции не вызывается.
function modulesOf(state: InstanceState): Record<string, unknown> | null {
  const uses = state.entry?.uses ?? [];
  const modules: Record<string, unknown> = {};
  for (const use of uses) {
    try {
      modules[use] = state.runtime.partApi(use);
    } catch (error) {
      reportFailure(state, (withUnmount) => teardownOf(state, withUnmount), 'mount', error);
      return null;
    }
  }
  return modules;
}

function stateOf(runtime: InstanceRuntime, element: HTMLElement, entry: SectionEntry | null): InstanceState {
  const name = element.getAttribute('data-section') ?? '';
  const controller = new AbortController();
  return {
    element,
    name,
    id: element.getAttribute('data-section-id') ?? name,
    entry,
    controller,
    scope: createElScope(element, controller.signal),
    runtime,
    failed: { value: false },
    finished: { value: false },
    ctx: null,
    run: () => undefined,
  };
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

// Провайдер ctx.animate — поле animate у API части behaviors (блок 6); нет части или поля — null.
const isAnimateProvider = (value: unknown): value is AnimateProvider => typeof value === 'function';

function animateOfPart(runtime: InstanceRuntime): AnimateProvider | null {
  const api = runtime.apiOfPart('behaviors');
  if (typeof api !== 'object' || api === null || !('animate' in api)) return null;
  return isAnimateProvider(api.animate) ? api.animate : null;
}

const ctxDepsOf = (runtime: InstanceRuntime, state: InstanceState, input: SectionInput): CtxDeps => ({
  win: runtime.win,
  bus: runtime.bus,
  owner: state,
  scope: state.scope,
  run: state.run,
  signal: state.controller.signal,
  page: runtime.page,
  name: state.name,
  id: state.id,
  mode: runtime.mode,
  input,
  animate: animateOfPart(runtime),
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

export function startInstance(runtime: InstanceRuntime, element: HTMLElement, entry: SectionEntry | null): Instance {
  const state = stateOf(runtime, element, entry);
  const teardown = (withUnmount: boolean): void => teardownOf(state, withUnmount);
  state.run = createGuard((stage, error) => reportFailure(state, teardown, stage, error));

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
  teardown: () => teardown(true),
});
