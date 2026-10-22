import { messageOf } from '../../report';
import type { CoreHandle, InstanceHost, Json } from '../types';
import { BEHAVIORS, type BehaviorSpec } from './catalog';
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
  MotionPrefs,
} from './types';

// Часть behaviors (design.md блока 6, раздел 2): подключение готовых поведений и появлений к экземплярам секций.
// Экземпляры — таблица по id секции для save и restore превью; имена, о которых уже писали в консоль, — по одному разу.

interface AttachedBehavior {
  readonly name: string;
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
}

const SPEC_BY_NAME: ReadonlyMap<string, BehaviorSpec> = new Map(Object.entries(BEHAVIORS));

const isSavedItem = (value: unknown): value is SavedItem =>
  typeof value === 'object' && value !== null && 'name' in value && 'state' in value && typeof value.name === 'string';

const isSavedList = (value: unknown): value is readonly SavedItem[] =>
  Array.isArray(value) && value.every((item) => isSavedItem(item));

// Свои элементы: сам элемент, если подходит селектору, и потомки своей секции (вложенные секции — не наши).
function ownElements(host: InstanceHost, selector: string): readonly HTMLElement[] {
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
    attached: sameElement ? [...row?.attached ?? [], attached] : [attached],
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
  };
  try {
    attachToRow(state, host, { name, instance: behavior.attach(behaviorHost) });
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

const createOf = (options: BehaviorsOptions, state: PageState, core: CoreHandle): BehaviorsApi => {
  void core;
  document.addEventListener('merfy:page:ready', () => document.documentElement.removeAttribute(MOTION_FLAG), {
    once: true,
  });
  return Object.freeze({
    animate: options.animate ?? null,
    save: (sectionId: string): Json | null => saveOf(state, sectionId),
    restore: (sectionId: string, saved: Json): void => restoreOf(state, sectionId, saved),
  });
};

const attachOf = (options: BehaviorsOptions, state: PageState, api: BehaviorsApi, host: InstanceHost): void => {
  void api;
  const motion = motionPrefs(window, host.mode);
  ownElements(host, '[data-behavior]').forEach((root) => attachBehavior(state, options, host, root, motion));
  attachReveal(state, options, host, ownElements(host, '[data-animate]'), motion);
};

export function behaviors(options: BehaviorsOptions): BehaviorsPart {
  const state: PageState = { rows: new Map(), reported: new Set() };
  return {
    name: 'behaviors',
    create: (core: CoreHandle): BehaviorsApi => createOf(options, state, core),
    attach: (api: BehaviorsApi, host: InstanceHost): void => attachOf(options, state, api, host),
  };
}
