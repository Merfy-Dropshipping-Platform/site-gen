import type { ElScope } from './el';
import type { Action, Ctx, El, Result, SectionEvent } from './types';

// Имена в разметке (design.md блока 5, раздел 3.4; 11б А): data-action="pick" — действие секции,
// data-action="cart.add" — действие части SDK без скрипта; событие по умолчанию зависит от тега, несколько действий —
// через пробел. Один слушатель на тип события у <merfy-section>; события без всплытия — в фазе захвата и только у
// самого элемента с data-action.

// Действие части SDK в разметке, привязанное к API своей части: params — MarkupAction.params, call — вызов с API части.
export interface BoundMarkup {
  readonly params: readonly string[];
  call(values: Readonly<Record<string, string>>, event?: SectionEvent): Promise<Result<unknown>>;
}

export interface ActionHost {
  readonly root: HTMLElement;
  readonly scope: ElScope;
  readonly ctx: Ctx<object, never>;
  readonly actions: Readonly<Record<string, Action<object, never>>>;
  markup(name: string): BoundMarkup | null; // 'cart.add' → действие add части cart; нет части или действия — null
  readonly signal: AbortSignal;
  run(work: () => unknown): unknown; // предохранитель экземпляра, стадия runtime; отдаёт то, что вернул work
}

// Допустимые события раздела 3.4 — 20 имён.
export const ACTION_EVENTS: readonly string[] = [
  'click',
  'dblclick',
  'input',
  'change',
  'submit',
  'keydown',
  'keyup',
  'focusin',
  'focusout',
  'pointerdown',
  'pointerup',
  'pointerenter',
  'pointerleave',
  'mouseenter',
  'mouseleave',
  'scroll',
  'toggle',
  'transitionend',
  'animationend',
  'load',
];

// События без всплытия: слушатель — в фазе захвата, действие — только у самого элемента с data-action.
const NON_BUBBLING: ReadonlySet<string> = new Set([
  'mouseenter',
  'mouseleave',
  'pointerenter',
  'pointerleave',
  'scroll',
  'toggle',
  'load',
]);

// Событие по умолчанию: у полей — input, у формы — submit, у остального — click.
const DEFAULT_EVENTS: Readonly<Record<string, string>> = {
  input: 'input',
  select: 'input',
  textarea: 'input',
  form: 'submit',
};

interface ActionName {
  readonly event: string;
  readonly name: string;
}

const parseActions = (value: string, tag: string): readonly ActionName[] =>
  value
    .trim()
    .split(/\s+/)
    .filter((part) => part !== '')
    .map((part) => {
      const at = part.indexOf(':');
      const prefixed = at !== -1;
      return {
        event: prefixed ? part.slice(0, at) : (DEFAULT_EVENTS[tag] ?? 'click'),
        name: prefixed ? part.slice(at + 1) : part,
      };
    })
    .filter(({ event }) => ACTION_EVENTS.includes(event)); // неизвестное событие — действие пропускается

// Типы событий экземпляра — из data-action внутри корня и внутри содержимого всех его <template>: строки list появятся позже.
const eventTypesOf = (root: HTMLElement): ReadonlySet<string> => {
  const types = new Set<string>();
  const templates = [...root.querySelectorAll('template')].map((node) => node.content);
  const sources: readonly ParentNode[] = [root, ...templates];
  sources.forEach((source) => {
    source.querySelectorAll('[data-action]').forEach((node) => {
      parseActions(node.getAttribute('data-action') ?? '', node.localName).forEach(({ event }) => types.add(event));
    });
  });
  return types;
};

// Элемент действия — ближайший к цели элемент с data-action (сам или предок), не выше корня.
const actionElementOf = (event: Event, root: HTMLElement): HTMLElement | null => {
  const node = event.target;
  if (!(node instanceof Element)) return null;
  for (let cur: Element | null = node; cur !== null && root.contains(cur); cur = cur.parentElement) {
    if (cur.hasAttribute('data-action')) return cur instanceof HTMLElement ? cur : null;
  }
  return null;
};

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

const valuesOf = (target: Element, bound: BoundMarkup): Readonly<Record<string, string>> => {
  const values: Record<string, string> = {};
  bound.params.forEach((param) => {
    const value = target.getAttribute(`data-${param}`);
    if (value !== null) values[param] = value;
  });
  return values;
};

// Пока действие идёт — aria-busy у элемента; повторное событие этого элемента действие не вызывает.
const withBusy = (target: Element, outcome: unknown): void => {
  if (!(outcome instanceof Promise)) return;
  target.setAttribute('aria-busy', 'true');
  const done = (): void => target.removeAttribute('aria-busy');
  void outcome.then(done, done); // отказ запишет предохранитель, здесь снимается только метка занятости
};

export function listenActions(host: ActionHost): void {
  const onEvent = (event: Event): void => {
    const target = actionElementOf(event, host.root);
    if (target === null) return;
    if (NON_BUBBLING.has(event.type) && event.target !== target) return;
    if (target.getAttribute('aria-busy') === 'true') return;
    if (event.type === 'submit') event.preventDefault(); // форма с data-action не уходит со страницы
    parseActions(target.getAttribute('data-action') ?? '', target.localName)
      .filter(({ event: type }) => type === event.type)
      .forEach(({ name }) => runAction(host, target, name, event));
  };
  eventTypesOf(host.root).forEach((type) => {
    host.root.addEventListener(type, onEvent, { signal: host.signal, capture: NON_BUBBLING.has(type) });
  });
}

function runAction(host: ActionHost, target: HTMLElement, name: string, event: Event): void {
  const sectionEvent = (): SectionEvent => sectionEventOf(event, host.scope);
  if (!name.includes('.')) {
    const own = host.actions[name];
    if (own !== undefined)
      withBusy(
        target,
        host.run(() => own(host.scope.wrap(target), host.ctx, sectionEvent())),
      );
    return;
  }
  const bound = host.markup(name);
  if (bound !== null)
    withBusy(
      target,
      host.run(() => bound.call(valuesOf(target, bound), sectionEvent())),
    );
}
