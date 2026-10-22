import type { Behavior, BehaviorHost, BehaviorInstance } from './types';

// Меню шапки (design.md блока 6, раздел 6; блок 7, п. 16): свой код по шаблону W3C APG Disclosure Navigation Menu —
// до трёх уровней, открыта одна ветка, Escape и нажатие вне закрывают, open-on="hover" с задержками 200/300 мс.

const OPEN_DELAY_MS = 200;
const CLOSE_DELAY_MS = 300;

interface Item {
  readonly element: HTMLElement;
  readonly trigger: HTMLElement | null;
  readonly content: HTMLElement | null; // есть подменю — есть и кнопка, и содержание
  readonly siblings: readonly Item[];
}

interface Menu {
  readonly items: readonly Item[];
  readonly topLevel: readonly Item[];
  open(item: Item): void;
  toggle(item: Item): void;
  closeAll(): void;
}

const firstFocusableOf = (scope: HTMLElement): HTMLElement | null =>
  scope.querySelector<HTMLElement>('[data-part="trigger"], [data-part="link"]');

// Пункты — части item своей ветки; данные list внутри content дают следующий уровень.
function collectLevel(list: HTMLElement, items: Item[]): Item[] {
  const level: Item[] = [];
  [...list.children].forEach((child) => {
    if (!child.matches('[data-part="item"]') || !(child instanceof HTMLElement)) return;
    const item: Item = {
      element: child,
      trigger: child.querySelector<HTMLElement>(':scope > [data-part="trigger"]'),
      content: child.querySelector<HTMLElement>(':scope > [data-part="content"]'),
      siblings: level,
    };
    level.push(item);
    items.push(item);
    const nested = child.querySelector<HTMLElement>('[data-part="content"] > [data-part="list"]');
    if (nested !== null) collectLevel(nested, items);
  });
  return level;
}

// Состояние открытых пунктов: применение одного пункта и закрытие его ветки.
function stateOf(host: BehaviorHost, items: readonly Item[]) {
  const opened = new Set<HTMLElement>();

  const apply = (item: Item, open: boolean): void => {
    if (item.content === null || item.trigger === null) return;
    item.content.toggleAttribute('hidden', !open);
    item.trigger.setAttribute('aria-expanded', String(open));
    item.element.toggleAttribute('data-open', open);
    if (open) opened.add(item.element);
    else opened.delete(item.element);
  };

  const ancestorsOf = (element: HTMLElement): readonly HTMLElement[] => {
    const chain: HTMLElement[] = [];
    for (let up = element.parentElement; up !== null && up !== host.root; up = up.parentElement) {
      if (up.matches('[data-part="item"]')) chain.push(up);
    }
    return chain;
  };

  const closeBranch = (item: Item): void => {
    items
      .filter((other) => other.element === item.element || item.element.contains(other.element))
      .forEach((other) => apply(other, false));
  };

  return { opened, apply, ancestorsOf, closeBranch };
}

function menuOf(host: BehaviorHost): Menu {
  const items: Item[] = [];
  const root = host.root.querySelector<HTMLElement>('[data-part="list"]');
  const topLevel = root === null ? [] : collectLevel(root, items);
  const { opened, apply, ancestorsOf, closeBranch } = stateOf(host, items);

  const open = (item: Item): void => {
    const keep = [item.element, ...ancestorsOf(item.element)];
    items.forEach((other) => {
      if (!keep.includes(other.element) && opened.has(other.element)) closeBranch(other);
    });
    apply(item, true);
  };
  const toggle = (item: Item): void => {
    if (opened.has(item.element)) {
      closeBranch(item);
      return;
    }
    open(item);
  };
  const closeAll = (): void => {
    items.forEach((item) => {
      if (opened.has(item.element)) apply(item, false);
    });
  };
  return { items, topLevel, open, toggle, closeAll };
}

function listenClick(host: BehaviorHost, menu: Menu): void {
  menu.items.forEach((item) => {
    item.trigger?.addEventListener('click', () => menu.toggle(item), { signal: host.signal });
  });
}

function listenOutside(host: BehaviorHost, menu: Menu): void {
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.target instanceof Node && host.root.contains(event.target)) return;
      menu.closeAll();
    },
    { signal: host.signal },
  );
}

// ↓ и ↑ — следующий и предыдущий пункт того же уровня, без перехода по кругу.
function moveAcrossLevel(event: KeyboardEvent, menu: Menu, target: HTMLElement): void {
  event.preventDefault();
  const own = target.closest<HTMLElement>('[data-part="item"]');
  const level = menu.items.find((item) => item.element === own)?.siblings ?? [];
  const focusables = level.map((item) => item.trigger ?? firstFocusableOf(item.element));
  const at = focusables.indexOf(target);
  const next = event.key === 'ArrowDown' ? at + 1 : at - 1;
  if (at >= 0 && next >= 0 && next < focusables.length) focusables[next]?.focus();
}

// ← и → — предыдущий и следующий пункт верхнего уровня (кнопка или ссылка).
function moveTopLevel(event: KeyboardEvent, menu: Menu, target: HTMLElement): void {
  event.preventDefault();
  const focusables = menu.topLevel.map((item) => item.trigger ?? firstFocusableOf(item.element));
  const at = focusables.indexOf(target);
  const next = event.key === 'ArrowRight' ? at + 1 : at - 1;
  if (at >= 0 && next >= 0 && next < focusables.length) focusables[next]?.focus();
}

function listenKeys(host: BehaviorHost, menu: Menu): void {
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        const branch = menu.topLevel.find((item) => item.element.hasAttribute('data-open'));
        menu.closeAll();
        branch?.trigger?.focus();
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLElement) || !host.root.contains(target)) return;
      handleArrows(event, menu, target);
    },
    { signal: host.signal },
  );
}

// ↓ на кнопке верхнего уровня: открыть ветку и вести к первому пункту её содержания; внутри content ↓ и ↑ —
// по пунктам того же уровня.
function handleArrows(event: KeyboardEvent, menu: Menu, target: HTMLElement): void {
  const item = menu.items.find((one) => one.trigger === target);
  const topLevelTrigger = item !== undefined && menu.topLevel.includes(item);
  if (event.key === 'ArrowDown' && topLevelTrigger && item?.content !== null && item !== undefined) {
    event.preventDefault();
    menu.open(item);
    if (item.content !== null) firstFocusableOf(item.content)?.focus();
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') moveAcrossLevel(event, menu, target);
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') moveTopLevel(event, menu, target);
}

// open-on="hover": вход мыши в пункт верхнего уровня открывает его через 200 мс, уход — закрывает через 300 мс;
// новый вход отменяет закрытие; таймеры снимаются сигналом секции.
function listenHover(host: BehaviorHost, menu: Menu): void {
  let openTimer: number | undefined;
  let closeTimer: number | undefined;
  menu.topLevel.forEach((item) => {
    item.element.addEventListener(
      'pointerenter',
      () => {
        window.clearTimeout(openTimer);
        window.clearTimeout(closeTimer);
        openTimer = window.setTimeout(() => menu.open(item), OPEN_DELAY_MS);
      },
      { signal: host.signal },
    );
    item.element.addEventListener(
      'pointerleave',
      () => {
        window.clearTimeout(openTimer);
        closeTimer = window.setTimeout(() => menu.closeAll(), CLOSE_DELAY_MS);
      },
      { signal: host.signal },
    );
  });
}

export const navMenu: Behavior<'nav-menu'> = {
  name: 'nav-menu',
  attach(host: BehaviorHost): BehaviorInstance {
    const menu = menuOf(host);
    const sectionId = host.section.getAttribute('data-section-id') ?? host.section.id;
    menu.items.forEach((item, index) => {
      if (item.content === null || item.trigger === null) return;
      if (item.content.id === '') item.content.id = `${sectionId}-menu-${index + 1}`;
      item.content.setAttribute('hidden', '');
      item.trigger.setAttribute('aria-expanded', 'false');
      item.trigger.setAttribute('aria-controls', item.content.id);
    });
    listenClick(host, menu);
    listenOutside(host, menu);
    listenKeys(host, menu);
    if (host.params['open-on'] === 'hover') listenHover(host, menu);
    return {};
  },
};
