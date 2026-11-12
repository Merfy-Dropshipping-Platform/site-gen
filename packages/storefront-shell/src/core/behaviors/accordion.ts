import { done, refuse } from './command';
import type { Behavior, BehaviorCommand, BehaviorHost, BehaviorInstance } from './types';
import { animateNode } from './animate-node';

// Аккордеон (design.md блока 6, раздел 4; факт 10 — satin «Вопросы»): <details> и <summary> — браузер, поведение
// добавляет плавное раскрытие. Общий name у соседних пунктов — открыт один; пока идёт анимация, нажатия ничего не делают.

const OPEN_DURATION = 350;
const CLOSE_DURATION = 300;

interface Item {
  readonly details: HTMLDetailsElement;
  readonly summary: HTMLElement | null;
  readonly content: HTMLElement | null;
  busy: boolean;
}

const itemsOf = (root: HTMLElement): readonly Item[] =>
  [...root.querySelectorAll<HTMLDetailsElement>('details')]
    .filter((details) => details.closest('[data-behavior]') === root)
    .map((details) => ({
      details,
      summary: details.querySelector<HTMLElement>(':scope > summary'),
      content: details.querySelector<HTMLElement>(':scope > [data-part="content"]'),
      busy: false,
    }));

const clearStyles = (content: HTMLElement): void => {
  content.style.height = '';
  content.style.opacity = '';
  content.style.overflow = '';
};

const finishOf = (item: Item, content: HTMLElement, after?: () => void) => (): void => {
  item.busy = false;
  clearStyles(content);
  after?.();
};

// Раскрытие: высота 0 → высота содержимого и прозрачность 0 → 1 (факт 10).
function openItem(host: BehaviorHost, item: Item): void {
  item.details.setAttribute('open', '');
  const content = item.content;
  if (content === null || host.motion.reduced) return;
  const height = content.scrollHeight;
  content.style.overflow = 'hidden';
  const run = animateNode(
    content,
    { height: ['0px', `${height}px`], opacity: [0, 1] },
    { duration: OPEN_DURATION, easing: 'power2.out' },
    { instant: false, signal: host.signal },
  );
  item.busy = true;
  void run.finished.then(finishOf(item, content));
}

// Закрытие: открытый атрибут снимается после анимации; after — вслед за ней (возврат name соседа по группе).
function closeItem(host: BehaviorHost, item: Item, after?: () => void): void {
  const content = item.content;
  if (content === null) {
    item.details.removeAttribute('open');
    after?.();
    return;
  }
  if (host.motion.reduced) {
    item.details.removeAttribute('open');
    clearStyles(content);
    after?.();
    return;
  }
  const height = content.scrollHeight;
  const run = animateNode(
    content,
    { height: [`${height}px`, '0px'], opacity: [1, 0] },
    { duration: CLOSE_DURATION, easing: 'power2.inOut' },
    { instant: false, signal: host.signal },
  );
  item.busy = true;
  void run.finished.then(
    finishOf(item, content, () => {
      item.details.removeAttribute('open');
      after?.();
    }),
  );
}

// Общий name: открыт один. У закрывающегося соседа на время анимации name снимается — иначе браузер закроет его сам,
// сразу и без анимации, когда откроется новый пункт; по концу name возвращается.
function collapseGroup(host: BehaviorHost, items: readonly Item[], opened: Item): void {
  const name = opened.details.getAttribute('name');
  if (name === null) return;
  items
    .filter((item) => item !== opened && item.details.open && item.details.getAttribute('name') === name)
    .forEach((item) => {
      closeItem(host, item);
    });
}

function restoreItems(items: readonly Item[], state: unknown): void {
  if (!Array.isArray(state)) return;
  state.forEach((index) => {
    const item = items[Number(index)];
    if (item === undefined || item.details.open) return;
    if (item.content !== null) clearStyles(item.content);
    item.details.setAttribute('open', '');
  });
}

// Нажатие на summary и команда toggle: свёрнутый раскрывается, раскрытый сворачивается; идёт анимация — ничего.
function toggleItem(host: BehaviorHost, items: readonly Item[], item: Item): void {
  if (item.busy) return;
  if (item.details.open) {
    closeItem(host, item);
    return;
  }
  // Соседей по name закрываем до открытия: браузер закрывает их сам, как только у пункта появится open.
  collapseGroup(host, items, item);
  openItem(host, item);
}

// Команды для скрипта секции (ctx.behavior("accordion"), 03.11): пункт — номер с 0 или id его <details>.
function commandsOf(host: BehaviorHost, items: readonly Item[]): Readonly<Record<string, BehaviorCommand>> {
  const find = (ref: unknown): Item | undefined =>
    typeof ref === 'number' ? items[ref] : items.find((item) => item.details.id === ref);
  const on =
    (act: (item: Item) => void): BehaviorCommand =>
    (ref) => {
      const item = find(ref);
      if (item === undefined) return refuse(`ctx.behavior("accordion"): нет пункта ${JSON.stringify(ref)}`);
      act(item);
      return done();
    };
  return {
    open: on((item) => {
      if (!item.details.open) toggleItem(host, items, item);
    }),
    close: on((item) => {
      if (item.details.open) toggleItem(host, items, item);
    }),
    toggle: on((item) => toggleItem(host, items, item)),
  };
}

export const accordion: Behavior<'accordion'> = {
  name: 'accordion',
  attach(host: BehaviorHost): BehaviorInstance {
    const items = itemsOf(host.root);
    items.forEach((item) => {
      item.summary?.addEventListener(
        'click',
        (event) => {
          event.preventDefault();
          toggleItem(host, items, item);
        },
        { signal: host.signal },
      );
    });
    return {
      commands: commandsOf(host, items),
      save: () => items.map((item, index) => (item.details.open ? index : -1)).filter((index) => index >= 0),
      restore: (state) => restoreItems(items, state),
    };
  },
};
