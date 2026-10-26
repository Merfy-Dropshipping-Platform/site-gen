import { ShellError } from '../errors';
import { checkAttributeWrite, checkCssVar } from './attributes';
import type { El } from './types';

// Обёртки элементов одного экземпляра секции (design.md блока 5, раздел 3.3): от обёртки не дойти до узла страницы —
// методы отдают строки, числа, булевы значения и другие обёртки. После снятия экземпляра (signal.aborted) запись
// ничего не делает и не бросает, чтение — пустое.
export interface ElScope {
  wrap(node: Element): El; // одна обёртка на узел в пределах области
  nodeOf(el: El): Element | null; // узел обёртки этой области — только для ядра; обёртка другой области — null
  ref(name: string): El | null; // первый [data-ref="name"] внутри корня
  refs(name: string): readonly El[]; // все, в порядке документа
}

// Служебное состояние области: корень секции, сигнал снятия, кеш «узел → обёртка», строки list по узлам-спискам.
interface ScopeState {
  readonly root: HTMLElement;
  readonly signal: AbortSignal;
  readonly cache: WeakMap<Element, El>;
  readonly rows: WeakMap<Element, readonly Element[]>;
  wrap(node: Element): El;
}

const refSelector = (name: string): string => `[data-ref="${name}"]`;

// Узлы обёрток всех секций страницы (блок 12, часть 12е): часть files получает узел обёртки, которую передала секция.
// Из index.ts не экспортируется — у секций только обёртки.
const ELEMENTS = new WeakMap<El, Element>();
export const elementOf = (el: El): Element | null => ELEMENTS.get(el) ?? null;
const freeButtonTypes: ReadonlySet<string> = new Set(['button', 'submit', 'reset']);
const EMPTY_FORM: Readonly<Record<string, string | boolean>> = Object.freeze({});

// Правка текста в превью (блок 1): пока элемент или его предок в пределах корня редактируется, text(value) его не трогает.
const editableWithin = (node: Element, root: HTMLElement): boolean => {
  for (let cur: Element | null = node; cur !== null && root.contains(cur); cur = cur.parentElement) {
    const editing = cur.getAttribute('contenteditable');
    if (editing !== null && editing !== 'false') return true;
  }
  return false;
};

function textOf(node: Element, state: ScopeState) {
  function text(): string;
  function text(value: string | number): void;
  function text(value?: string | number): string | void {
    if (value === undefined) return state.signal.aborted ? '' : (node.textContent ?? '');
    if (state.signal.aborted || editableWithin(node, state.root)) return;
    node.textContent = String(value);
  }
  return text;
}

function attrOf(node: Element, state: ScopeState) {
  function attr(name: string): string | null;
  function attr(name: string, value: string | null): void;
  function attr(name: string, value?: string | null): string | null | void {
    if (value === undefined) return state.signal.aborted ? null : node.getAttribute(name);
    if (state.signal.aborted) return; // сигнал проверяется раньше границы записи: снятие не бросает
    const allowed = checkAttributeWrite(node.localName, name, value);
    if (value === null) node.removeAttribute(allowed);
    else node.setAttribute(allowed, value);
  }
  return attr;
}

const cssVarOf = (node: Element, state: ScopeState): El['cssVar'] => {
  const apply = (property: string, value: string | number | null): void => {
    if (!(node instanceof HTMLElement)) return;
    if (value === null) node.style.removeProperty(property);
    else node.style.setProperty(property, String(value));
  };
  return (name, value) => {
    if (state.signal.aborted) return;
    apply(checkCssVar(name, value), value);
  };
};

const hasClassOf =
  (node: Element, state: ScopeState): El['hasClass'] =>
  (name) =>
    !state.signal.aborted && node.classList.contains(name);

const toggleClassOf =
  (node: Element, state: ScopeState): El['toggleClass'] =>
  (name, on) => {
    if (state.signal.aborted) return;
    node.classList.toggle(name, on);
  };

const setHidden = (node: Element, state: ScopeState, on: boolean): void => {
  if (state.signal.aborted) return;
  if (on) node.setAttribute('hidden', '');
  else node.removeAttribute('hidden');
};

const visibleOf =
  (node: Element, state: ScopeState): El['visible'] =>
  () =>
    !state.signal.aborted && !node.hasAttribute('hidden');
const showOf =
  (node: Element, state: ScopeState): El['show'] =>
  () =>
    setHidden(node, state, false);
const hideOf =
  (node: Element, state: ScopeState): El['hide'] =>
  () =>
    setHidden(node, state, true);
const toggleOf =
  (node: Element, state: ScopeState): El['toggle'] =>
  (on) => {
    const hide = on === undefined ? !node.hasAttribute('hidden') : !on;
    setHidden(node, state, hide);
  };

function valueOf(node: Element, state: ScopeState) {
  const field = (): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null =>
    node instanceof HTMLInputElement || node instanceof HTMLSelectElement || node instanceof HTMLTextAreaElement
      ? node
      : null;
  function value(): string;
  function value(next: string): void;
  function value(next?: string): string | void {
    const input = field();
    if (input === null) {
      if (next === undefined) return '';
      return;
    }
    if (next !== undefined) {
      if (!state.signal.aborted) input.value = next;
      return;
    }
    return state.signal.aborted ? '' : input.value;
  }
  return value;
}

function checkedOf(node: Element, state: ScopeState) {
  function checked(): boolean;
  function checked(next: boolean): void;
  function checked(next?: boolean): boolean | void {
    if (!(node instanceof HTMLInputElement)) {
      if (next === undefined) return false;
      return;
    }
    if (next !== undefined) {
      if (!state.signal.aborted) node.checked = next;
      return;
    }
    return state.signal.aborted ? false : node.checked;
  }
  return checked;
}

// Поле формы по name: флажок — boolean, выбранное радио — значение (невыбранное пропускается), кнопки пропускаются.
const fieldValue = (field: Element): string | boolean | undefined => {
  if (field instanceof HTMLButtonElement) return undefined;
  if (field instanceof HTMLInputElement && field.type === 'checkbox') return field.checked;
  if (field instanceof HTMLInputElement && field.type === 'radio') return field.checked ? field.value : undefined;
  if (field instanceof HTMLInputElement && freeButtonTypes.has(field.type)) return undefined;
  if (field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) return field.value;
  if (field instanceof HTMLInputElement) return field.value;
  return undefined;
};

const formOf =
  (node: Element, state: ScopeState): El['form'] =>
  () => {
    if (state.signal.aborted || !(node instanceof HTMLFormElement)) return EMPTY_FORM;
    const fields: Record<string, string | boolean> = {};
    node.querySelectorAll('[name]').forEach((field) => {
      const name = field.getAttribute('name');
      const value = fieldValue(field);
      if (name !== null && name !== '' && value !== undefined) fields[name] = value;
    });
    return Object.freeze(fields);
  };

const focusOf =
  (node: Element, state: ScopeState): El['focus'] =>
  () => {
    if (!state.signal.aborted && node instanceof HTMLElement) node.focus();
  };

const refOf =
  (node: Element, state: ScopeState): El['ref'] =>
  (name) => {
    if (state.signal.aborted) return null;
    const found = node.querySelector(refSelector(name));
    return found === null ? null : state.wrap(found);
  };

const refsOf =
  (node: Element, state: ScopeState): El['refs'] =>
  (name) => {
    if (state.signal.aborted) return [];
    return [...node.querySelectorAll(refSelector(name))].map((found) => state.wrap(found));
  };

const closestOf =
  (node: Element, state: ScopeState): El['closest'] =>
  (name) => {
    if (state.signal.aborted) return null;
    for (let cur: Element | null = node; cur !== null && state.root.contains(cur); cur = cur.parentElement) {
      if (cur.getAttribute('data-ref') === name) return state.wrap(cur);
    }
    return null;
  };

const templateOf = (node: Element): HTMLTemplateElement => {
  for (let i = 0; i < node.children.length; i += 1) {
    const child = node.children[i];
    if (child instanceof HTMLTemplateElement) return child;
  }
  throw new ShellError('sdk-call-invalid', `у <${node.localName}> нет дочернего <template>`);
};

// Строки, которых нет в HTML сборки: копия содержимого <template> на элемент массива, вставка по порядку после шаблона.
const listOf =
  (node: Element, state: ScopeState): El['list'] =>
  <T>(items: readonly T[], fill: (row: El, item: T, index: number) => void): void => {
    if (state.signal.aborted) return;
    const template = templateOf(node);
    const previous = state.rows.get(node) ?? [];
    previous.forEach((row) => row.remove());
    const inserted: Element[] = [];
    let anchor: Element = template;
    items.forEach((item, index) => {
      const copy = template.content.cloneNode(true);
      if (!(copy instanceof DocumentFragment)) return;
      const rowNode = copy.firstElementChild;
      anchor.after(copy);
      if (rowNode === null) return;
      inserted.push(rowNode);
      anchor = rowNode;
      fill(state.wrap(rowNode), item, index);
    });
    state.rows.set(node, inserted);
  };

const buildEl = (node: Element, state: ScopeState): El => {
  const el: El = {
    text: textOf(node, state),
    hasClass: hasClassOf(node, state),
    toggleClass: toggleClassOf(node, state),
    show: showOf(node, state),
    hide: hideOf(node, state),
    toggle: toggleOf(node, state),
    visible: visibleOf(node, state),
    attr: attrOf(node, state),
    cssVar: cssVarOf(node, state),
    value: valueOf(node, state),
    checked: checkedOf(node, state),
    form: formOf(node, state),
    focus: focusOf(node, state),
    ref: refOf(node, state),
    refs: refsOf(node, state),
    closest: closestOf(node, state),
    list: listOf(node, state),
  };
  return Object.freeze(el);
};

export function createElScope(root: HTMLElement, signal: AbortSignal): ElScope {
  const cache = new WeakMap<Element, El>();
  const nodes = new WeakMap<El, Element>();
  const rows = new WeakMap<Element, readonly Element[]>();
  const state: ScopeState = {
    root,
    signal,
    cache,
    rows,
    wrap: (node: Element): El => wrap(node),
  };

  function wrap(node: Element): El {
    const cached: El | undefined = cache.get(node);
    if (cached !== undefined) return cached;
    const el = buildEl(node, state);
    cache.set(node, el);
    nodes.set(el, node);
    ELEMENTS.set(el, node);
    return el;
  }

  return {
    wrap,
    nodeOf: (el: El): Element | null => nodes.get(el) ?? null,
    ref: refOf(root, state),
    refs: refsOf(root, state),
  };
}
