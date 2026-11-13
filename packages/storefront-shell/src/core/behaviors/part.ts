import { messageOf } from '../../report';
import type {
  BehaviorHandleName,
  BehaviorHandles,
  CoreHandle,
  InstanceHost,
  Json,
  NoData,
  Result,
} from '../types';
import { BEHAVIORS, type BehaviorSpec, type CommandArg } from './catalog';
import { invalid, refuse } from './command';
import { MOTION_FLAG } from './motion-css';
import { motionPrefs } from './prefs';
import { readParams } from './params';
import type {
  Behavior,
  BehaviorHost,
  BehaviorInstance,
  BehaviorsApi,
  BehaviorsOptions,
  BehaviorsPart,
  ControlProvider,
  MotionPrefs,
} from './types';

// Часть behaviors (design.md блока 6, раздел 2): подключение готовых поведений и появлений к экземплярам секций.
// Экземпляры — таблица по id секции для save и restore превью; имена, о которых уже писали в консоль, — по одному разу.
// С 03.11 та же таблица отдаёт скрипту секции команды поведений его разметки (ctx.behavior, control ниже).

interface AttachedBehavior {
  readonly name: string;
  readonly root: HTMLElement; // элемент с data-behavior
  readonly instance: BehaviorInstance;
}

interface SectionRow {
  readonly element: HTMLElement; // экземпляры одного элемента; замена секции с тем же id пишет свою строку
  readonly attached: readonly AttachedBehavior[];
}

// Type-псевдоним (не interface): объектный литеральный тип получает неявную сигнатуру индекса и входит в Json.
type SavedItem = { readonly name: string; readonly state: Json };

interface PageState {
  readonly rows: Map<string, SectionRow>;
  readonly reported: Set<string>;
  core: CoreHandle | null; // ядро страницы — из create, до первого attach (блок 11, Р11б-13)
}

const SPEC_BY_NAME: ReadonlyMap<string, BehaviorSpec> = new Map(Object.entries(BEHAVIORS));

const isSavedItem = (value: unknown): value is SavedItem =>
  typeof value === 'object' && value !== null && 'name' in value && 'state' in value && typeof value.name === 'string';

const isSavedList = (value: unknown): value is readonly SavedItem[] =>
  Array.isArray(value) && value.every((item) => isSavedItem(item));

// Свои элементы: сам элемент, если подходит селектору, и потомки своей секции (вложенные секции — не наши).
function ownElements(host: Pick<InstanceHost, 'element'>, selector: string): readonly HTMLElement[] {
  const inside = (element: Element): boolean => element.closest('merfy-section') === host.element;
  const descendants = [...host.element.querySelectorAll<HTMLElement>(selector)].filter(inside);
  const self = host.element.matches(selector) ? [host.element] : [];
  return [...self, ...descendants];
}

function reportOnce(state: PageState, key: string, text: string): void {
  if (state.reported.has(key)) return;
  state.reported.add(key);
  console.error(text);
}

function attachToRow(state: PageState, host: InstanceHost, attached: AttachedBehavior): void {
  const row = state.rows.get(host.id);
  const sameElement = row !== undefined && row.element === host.element;
  state.rows.set(host.id, {
    element: host.element,
    attached: sameElement ? [...(row?.attached ?? []), attached] : [attached],
  });
  // Снятие экземпляра удаляет строку, если в таблице всё ещё строка его элемента: замена секции с тем же id
  // записывает свою — её старый сигнал не трогает.
  host.signal.addEventListener(
    'abort',
    () => {
      const current = state.rows.get(host.id);
      if (current !== undefined && current.element === host.element) state.rows.delete(host.id);
    },
    { once: true },
  );
}

function tryAttach(
  state: PageState,
  host: InstanceHost,
  name: string,
  behavior: Behavior,
  root: HTMLElement,
  motion: MotionPrefs,
): void {
  const behaviorHost: BehaviorHost = {
    root,
    section: host.element,
    params: readParams(root, SPEC_BY_NAME.get(name)?.params ?? {}),
    motion,
    signal: host.signal,
    ...(state.core === null ? {} : { core: state.core }),
  };
  try {
    attachToRow(state, host, { name, root, instance: behavior.attach(behaviorHost) });
  } catch (error) {
    console.error(`Поведение ${name} в секции ${host.name}#${host.id}: ${messageOf(error)}`);
  }
}

function attachBehavior(
  state: PageState,
  options: BehaviorsOptions,
  host: InstanceHost,
  root: HTMLElement,
  motion: MotionPrefs,
): void {
  const name = root.getAttribute('data-behavior') ?? '';
  const spec = SPEC_BY_NAME.get(name);
  if (spec === undefined) {
    reportOnce(state, name, `Поведение ${name}: такого нет в каталоге SDK`);
    return;
  }
  if (root === host.element && !spec.onSection) {
    reportOnce(state, name, `Поведение ${name}: на <merfy-section> ставится только sticky-header`);
    return;
  }
  const behavior = options.list.find((item) => item.name === name);
  if (behavior === undefined) {
    reportOnce(state, name, `Поведение ${name}: его кода нет в скрипте страницы`);
    return;
  }
  tryAttach(state, host, name, behavior, root, motion);
}

function attachReveal(
  state: PageState,
  options: BehaviorsOptions,
  host: InstanceHost,
  elements: readonly HTMLElement[],
  motion: MotionPrefs,
): void {
  if (elements.length === 0) return;
  const reveal = options.reveal;
  if (reveal === undefined) {
    reportOnce(state, 'data-animate', 'Появления data-animate: их кода нет в скрипте страницы');
    return;
  }
  try {
    reveal.attach({ section: host.element, elements, motion, signal: host.signal });
  } catch (error) {
    console.error(`Появления data-animate в секции ${host.name}#${host.id}: ${messageOf(error)}`);
  }
}

const saveOf = (state: PageState, sectionId: string): Json | null => {
  const row = state.rows.get(sectionId);
  if (row === undefined) return null;
  return row.attached.map(({ name, instance }) => ({ name, state: instance.save?.() ?? null }));
};

function restoreOf(state: PageState, sectionId: string, saved: Json): void {
  if (!isSavedList(saved)) return;
  const row = state.rows.get(sectionId);
  if (row === undefined) return;
  saved.forEach((item, index) => {
    const attached = row.attached[index];
    if (attached === undefined || attached.name !== item.name) return;
    try {
      attached.instance.restore?.(item.state);
    } catch (error) {
      console.error(`Поведение ${attached.name} в секции restore: ${messageOf(error)}`);
    }
  });
}

// Команды скрипта секции (ctx.behavior, 03.11): поведения своей разметки, только своей секции — таблица rows и ownElements
// не знают чужих. Аргумент проверяется здесь по каталогу, само поведение получает уже годное значение.
const isRecord = (value: unknown): boolean => typeof value === 'object' && value !== null && !Array.isArray(value);
const isIndex = (value: unknown): boolean => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const isText = (value: unknown): boolean => typeof value === 'string' && value !== '';

const ARG_CHECKS: Readonly<Record<CommandArg, { ok: (arg: unknown) => boolean; need: string }>> = {
  none: { ok: () => true, need: '' },
  item: { ok: (arg) => isIndex(arg) || isText(arg), need: 'нужен номер пункта с 0 или его id' },
  index: { ok: isIndex, need: 'нужен номер с 0' },
  value: { ok: isText, need: 'нужна непустая строка' },
  options: { ok: (arg) => arg === undefined || isRecord(arg), need: 'нужен объект параметров или ничего' },
};

function runCommand(
  attached: AttachedBehavior,
  signal: AbortSignal,
  command: string,
  kind: CommandArg,
  arg: unknown,
): Result<NoData> {
  const label = `ctx.behavior("${attached.name}").${command}`;
  if (signal.aborted) return refuse(`${label}: секция уже снята со страницы`);
  const check = ARG_CHECKS[kind];
  if (!check.ok(arg)) return invalid(`${label}: ${check.need}`);
  const run = attached.instance.commands?.[command];
  if (run === undefined) return refuse(`${label}: в разметке поведения нет частей для этой команды`);
  return run(arg);
}

const COMMAND_NAMES = Object.entries(BEHAVIORS)
  .filter(([, spec]) => spec.commands !== undefined)
  .map(([name]) => name)
  .join(', ');

// Какое из поведений секции имеется в виду: within — узел внутри поведения (самое вложенное из подходящих); без него
// поведение должно быть одно. Нет такого — Error с текстом для автора: его ловит предохранитель секции.
function pickAttached(
  state: PageState,
  section: Pick<InstanceHost, 'element' | 'id' | 'signal'>,
  name: string,
  within: Element | null | undefined,
): AttachedBehavior {
  const label = `ctx.behavior("${name}")`;
  if (section.signal.aborted) throw new Error(`${label}: секция уже снята со страницы`);
  if (within === null) throw new Error(`${label}: элемент не из этой секции`);
  const row = state.rows.get(section.id);
  const own = row !== undefined && row.element === section.element ? row.attached.filter((a) => a.name === name) : [];
  const found = within === undefined ? own : own.filter((a) => a.root.contains(within));
  const last = found.at(-1);
  if (last !== undefined && (within !== undefined || found.length === 1)) return last;
  if (last !== undefined) throw new Error(`${label}: в секции несколько таких поведений — укажите элемент внутри нужного`);
  if (own.length > 0) throw new Error(`${label}: элемент не внутри поведения ${name}`);
  if (ownElements(section, `[data-behavior="${name}"]`).length === 0)
    throw new Error(`${label}: в разметке секции нет data-behavior="${name}"`);
  throw new Error(`${label}: кода поведения нет на странице — пересоберите страницу`);
}

// Форма команд — по каталогу: проверяется только то, что это объект (как part() ядра).
function isHandleOf<N extends BehaviorHandleName>(value: unknown): value is BehaviorHandles[N] {
  return typeof value === 'object' && value !== null;
}

const controlOf =
  (state: PageState): ControlProvider =>
  (section, name, within) => {
    const commands = SPEC_BY_NAME.get(name)?.commands;
    if (commands === undefined) throw new Error(`ctx.behavior("${name}"): команды есть у ${COMMAND_NAMES}`);
    const attached = pickAttached(state, section, name, within);
    const entries = Object.entries(commands).map(
      ([command, kind]) =>
        [command, (arg?: unknown): Result<NoData> => runCommand(attached, section.signal, command, kind, arg)] as const,
    );
    const handle = Object.freeze(Object.fromEntries(entries));
    if (!isHandleOf<typeof name>(handle)) throw new Error(`ctx.behavior("${name}"): команд нет`);
    return handle;
  };

const createOf = (options: BehaviorsOptions, state: PageState, core: CoreHandle): BehaviorsApi => {
  state.core = core;
  document.addEventListener('merfy:page:ready', () => document.documentElement.removeAttribute(MOTION_FLAG), {
    once: true,
  });
  return Object.freeze({
    animate: options.animate ?? null,
    split: options.split ?? null,
    pointer: options.pointer ?? null,
    control: controlOf(state),
    save: (sectionId: string): Json | null => saveOf(state, sectionId),
    restore: (sectionId: string, saved: Json): void => restoreOf(state, sectionId, saved),
  });
};

const attachOf = (options: BehaviorsOptions, state: PageState, api: BehaviorsApi, host: InstanceHost): void => {
  void api;
  const motion = motionPrefs(window, host.mode, host.element);
  ownElements(host, '[data-behavior]').forEach((root) => attachBehavior(state, options, host, root, motion));
  attachReveal(state, options, host, ownElements(host, '[data-animate]'), motion);
};

export function behaviors(options: BehaviorsOptions): BehaviorsPart {
  const state: PageState = { rows: new Map(), reported: new Set(), core: null };
  return {
    name: 'behaviors',
    create: (core: CoreHandle): BehaviorsApi => createOf(options, state, core),
    attach: (api: BehaviorsApi, host: InstanceHost): void => attachOf(options, state, api, host),
  };
}
