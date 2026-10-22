import type { StorefrontConfig } from '@merfy/storefront-config';
import { readStorefrontConfig } from '@merfy/storefront-config/read';
import { SECTION_TAG, IDLE_HOOKS, useSectionElement, type ElementHooks } from '../element';
import { CORE_ERRORS, watchSectionErrors } from '../error-log';
import { ShellError } from '../errors';
import { messageOf } from '../report';
import { createEventBus, type EventBus } from './events';
import { SDK_MARKUP_SELECTOR, startInstance, type Instance, type InstanceRuntime, type MarkupCall } from './instance';
import { pageStorage, type KeyValue } from './storage';
import type {
  CoreHandle,
  EventDetail,
  EventName,
  InstanceHost,
  Mode,
  ModuleName,
  Modules,
  SdkPart,
  StartOptions,
} from './types';

// Старт ядра секций (design.md блока 5, раздел 3.6): все секции разом в порядке страницы, глобальные скрипты — в конце
// body; после прохода — merfy:page:ready и merfy:page:view. Снятие — микрозадачей позже, перенос узла не перезапускает.

export interface CoreEnv {
  readonly window: Window;
}

export interface StartedCore {
  readonly config: StorefrontConfig | null;
  readonly mode: Mode;
  stop(): void;
}

interface StartedPart {
  readonly part: SdkPart<string, unknown>;
  readonly api: unknown;
}

// StartOptions хранит части как SdkPart<string, unknown>: тип Api стёрт, поэтому part() возвращает Modules[N] по
// имени — форма API на совести самой части (шпион-часть в тестах отдаёт { marker }), проверяется только существование.
function isModuleOf<N extends ModuleName>(api: unknown): api is Modules[N] {
  return api !== undefined;
}

const GLOBAL_SELECTOR = (name: string): string => `${SECTION_TAG}[data-section="${name}"][data-merfy-global]`;

// Глобальный скрипт — секция без места: ядро ставит ей скрытый элемент в конец body (раздел 3.6, шаг 2).
function addGlobals(win: Window, sections: StartOptions['sections']): void {
  sections
    .filter((entry) => entry.kind === 'global')
    .forEach((entry) => {
      if (win.document.querySelector(GLOBAL_SELECTOR(entry.name)) !== null) return;
      const host = win.document.createElement(SECTION_TAG);
      host.setAttribute('data-section', entry.name);
      host.setAttribute('data-merfy-global', '');
      host.setAttribute('hidden', '');
      win.document.body.append(host);
    });
}

// Нет конфига — console.error, режим live: страница остаётся рабочей, ядро секций стартует и без конфига.
function readConfig(win: Window): { config: StorefrontConfig | null; mode: Mode } {
  try {
    const config = readStorefrontConfig(win.document);
    return { config, mode: config.mode };
  } catch (error) {
    console.error(`Конфиг витрины не прочитан: ${messageOf(error)}`);
    return { config: null, mode: 'live' };
  }
}

interface CoreParts {
  readonly core: CoreHandle;
  readonly started: readonly StartedPart[];
  apiOf<N extends ModuleName>(name: N): Modules[N]; // нет такой части на странице — ShellError part-unknown
}

// Части — create(core) один раз на страницу, по порядку options.parts, до запуска секций; API части замораживается.
function createCoreParts(config: StorefrontConfig | null, mode: Mode, bus: EventBus, options: StartOptions): CoreParts {
  const byName = new Map<string, StartedPart>();
  const started: StartedPart[] = [];
  const core: CoreHandle = Object.freeze({
    config,
    mode,
    emit: <E extends EventName>(name: E, detail: EventDetail<E>): void => bus.emit(name, detail),
    part: <N extends ModuleName>(name: N): Modules[N] => apiOf(name),
  });

  function apiOf<N extends ModuleName>(name: N): Modules[N] {
    const found = byName.get(name);
    if (found === undefined || !isModuleOf<N>(found.api))
      throw new ShellError('part-unknown', `части ${name} на странице нет`);
    return found.api;
  }

  options.parts.forEach((part) => {
    const api = part.create(core);
    if (typeof api === 'object' && api !== null) Object.freeze(api);
    const one: StartedPart = { part, api };
    started.push(one);
    byName.set(part.name, one);
  });
  return { core, started, apiOf };
}

const isModuleName = (name: string): name is ModuleName => name === 'cart' || name === 'favorites' || name === 'auth';

function runtimeOf(win: Window, mode: Mode, bus: EventBus, page: KeyValue, parts: CoreParts): InstanceRuntime {
  const attachAll = (host: InstanceHost): void => {
    parts.started.forEach(({ part, api }) => {
      if (part.attach === undefined) return;
      try {
        part.attach(api, host);
      } catch (error) {
        console.error(`attach части ${part.name}: ${messageOf(error)}`); // код платформы: экземпляр работает дальше
      }
    });
  };
  const markup = (name: string): MarkupCall | null => {
    const at = name.indexOf('.');
    const found = parts.started.find(({ part }) => part.name === name.slice(0, at));
    const action = found?.part.markup?.[name.slice(at + 1)];
    if (found === undefined || action === undefined) return null;
    return { params: action.params, call: (values) => action.call(found.api, values) };
  };
  const partApi = (name: string): unknown => {
    if (!isModuleName(name)) throw new ShellError('part-unknown', `части ${name} на странице нет`);
    return parts.apiOf(name);
  };
  // API созданной части платформы по имени (для ядра, не для кода секций): так ctx.animate получает провайдер behaviors.
  const apiOfPart = (name: string): unknown => parts.started.find(({ part }) => part.name === name)?.api ?? null;
  return { win, mode, bus, page, partApi, apiOfPart, attachAll, markup };
}

const startFor = (
  runtime: InstanceRuntime,
  byName: Map<string, StartOptions['sections'][number]>,
  instances: Map<HTMLElement, Instance>,
  element: HTMLElement,
): Instance | null => {
  const entry = byName.get(element.getAttribute('data-section') ?? '') ?? null;
  if (entry === null && !element.matches(SDK_MARKUP_SELECTOR) && element.querySelector(SDK_MARKUP_SELECTOR) === null)
    return null;
  const instance = startInstance(runtime, element, entry);
  instances.set(element, instance);
  return instance;
};

// Слушатели <merfy-section>: после первого прохода новый элемент запускается сразу; уход проверяется микрозадачей.
function hooksOf(
  win: Window,
  runtime: InstanceRuntime,
  byName: Map<string, StartOptions['sections'][number]>,
  instances: Map<HTMLElement, Instance>,
  state: { done: boolean },
): ElementHooks {
  return {
    connect: (element) => {
      if (!state.done || instances.has(element)) return;
      const instance = startFor(runtime, byName, instances, element);
      if (instance === null) return;
      runtime.bus.deliver(instance.owner, 'merfy:page:ready', {}); // только своим подписчикам, страница — без повтора
      runtime.bus.deliver(instance.owner, 'merfy:page:view', { path: win.location.pathname });
    },
    disconnect: (element) => {
      const instance = instances.get(element);
      if (instance === undefined) return;
      win.queueMicrotask(() => {
        if (element.isConnected) return; // перенос узла в документе — не снятие (раздел 3.6, шаг 5)
        instances.delete(element);
        instance.teardown();
      });
    },
  };
}

function runCore(
  win: Window,
  options: StartOptions,
  runtime: InstanceRuntime,
  controller: AbortController,
  read: { config: StorefrontConfig | null; mode: Mode },
): StartedCore {
  const byName = new Map(options.sections.map((entry) => [entry.name, entry]));
  const instances = new Map<HTMLElement, Instance>();
  const state = { done: false };
  useSectionElement(win.customElements, hooksOf(win, runtime, byName, instances, state));
  [...win.document.querySelectorAll(SECTION_TAG)].forEach((node) => {
    if (node instanceof HTMLElement) startFor(runtime, byName, instances, node);
  });
  state.done = true;
  runtime.bus.emit('merfy:page:ready', {}); // после синхронной части всех mount (13б Г)
  runtime.bus.emit('merfy:page:view', { path: win.location.pathname });
  return {
    config: read.config,
    mode: read.mode,
    stop: (): void => {
      [...instances.values()].forEach((instance) => instance.teardown());
      instances.clear();
      controller.abort();
      useSectionElement(win.customElements, IDLE_HOOKS);
    },
  };
}

export function start(options: StartOptions, env: CoreEnv = { window }): StartedCore {
  const win = env.window;
  const controller = new AbortController();
  const read = readConfig(win);
  const bus = createEventBus(win.document);
  const page = pageStorage(win, read.mode);
  if (read.config !== null && read.mode === 'live')
    watchSectionErrors(win, read.config, controller.signal, CORE_ERRORS); // до запуска секций: сбой старта — в пачке
  const parts = createCoreParts(read.config, read.mode, bus, options);
  const runtime = runtimeOf(win, read.mode, bus, page, parts);
  addGlobals(win, options.sections);
  return runCore(win, options, runtime, controller, read);
}
