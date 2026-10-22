import type { Animation, EasingName, Keyframes } from '../types';
import { animateNode } from './motion';
import type { Behavior, BehaviorHost, BehaviorInstance } from './types';

// Окно и выезжающая панель (design.md блока 6, раздел 5; факты 10, 12; дополнения блока 7, п. 15): <dialog> и
// showModal/show — браузер, переходы и запрет прокрутки — поведение. Немодальные окна секции — по одному.

const CLOSE_OTHERS_EVENT = 'merfy-dialog-close-others';

// Переходы (таблица задачи): кадры открытия (закрытие — те же кадры в обратном порядке), длительности, кривые, фон.
interface TransitionSpec {
  readonly open: Keyframes;
  readonly close: Keyframes;
  readonly openMs: number;
  readonly closeMs: number;
  readonly openEasing: EasingName;
  readonly closeEasing: EasingName;
  readonly backdropOpenEasing: EasingName;
  readonly backdropCloseEasing: EasingName;
}

const drawerEdge = (side: string): string => (side === 'left' ? '-100%' : '100%');
const drawerOpen = (side: string): Keyframes => ({ transform: [`translateX(${drawerEdge(side)})`, 'none'] });
const drawerClose = (side: string): Keyframes => ({ transform: ['none', `translateX(${drawerEdge(side)})`] });

const TRANSITIONS: Readonly<Record<string, (side: string) => TransitionSpec>> = {
  fade: () => ({
    open: { opacity: [0, 1] },
    close: { opacity: [1, 0] },
    openMs: 150,
    closeMs: 150,
    openEasing: 'ease-out',
    closeEasing: 'ease-out',
    backdropOpenEasing: 'ease-out',
    backdropCloseEasing: 'ease-out',
  }),
  drawer: (side) => ({
    open: drawerOpen(side),
    close: drawerClose(side),
    openMs: 300,
    closeMs: 300,
    openEasing: 'decelerate',
    closeEasing: 'decelerate',
    backdropOpenEasing: 'material',
    backdropCloseEasing: 'material',
  }),
  'drawer-back': (side) => ({
    open: drawerOpen(side),
    close: drawerClose(side),
    openMs: 500,
    closeMs: 400,
    openEasing: 'back.out',
    closeEasing: 'power3.in',
    backdropOpenEasing: 'power2.out',
    backdropCloseEasing: 'power2.in',
  }),
  drop: () => ({
    open: { clipPath: ['inset(0 0 100% 0)', 'inset(0 0 0 0)'] },
    close: { clipPath: ['inset(0 0 0 0)', 'inset(0 0 100% 0)'] },
    openMs: 300,
    closeMs: 300,
    openEasing: 'material',
    closeEasing: 'material',
    backdropOpenEasing: 'material',
    backdropCloseEasing: 'material',
  }),
};

const transitionOf = (name: string, side: string): TransitionSpec => (TRANSITIONS[name] ?? TRANSITIONS.drawer)(side);

// Запрет прокрутки (Р6-7): счётчик открытых окон страницы, прежнее значение возвращается после последнего.
let lockCount = 0;
let previousOverflow = '';

function lockScroll(): void {
  if (lockCount === 0) previousOverflow = document.documentElement.style.overflow;
  lockCount += 1;
  document.documentElement.style.overflow = 'hidden';
}

function unlockScroll(): void {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.documentElement.style.overflow = previousOverflow;
}

type BoxState = 'closed' | 'opening' | 'open' | 'closing';

interface Box {
  readonly host: BehaviorHost;
  readonly dialog: HTMLDialogElement;
  readonly opens: readonly HTMLElement[];
  readonly spec: TransitionSpec;
  readonly modal: boolean;
  state: BoxState;
  runs: Animation[];
  afterEscape: boolean;
}

const isInstant = (host: BehaviorHost): boolean => host.motion.reduced;

function panelAnimation(box: Box, closing: boolean): Animation {
  const spec = box.spec;
  return animateNode(
    box.dialog,
    closing ? spec.close : spec.open,
    { duration: closing ? spec.closeMs : spec.openMs, easing: closing ? spec.closeEasing : spec.openEasing },
    { instant: false, signal: box.host.signal },
  );
}

// Фон ::backdrop — только у модального окна; кадры прозрачности, кривая своя у каждого перехода. Завершённую анимацию
// фона Motion оставляет на элементе — перед новой отменяем её, чтобы видна была только текущая.
function backdropAnimation(box: Box, closing: boolean): Animation | null {
  if (!box.modal) return null;
  const spec = box.spec;
  document
    .getAnimations()
    .filter(
      (animation) =>
        animation.effect instanceof KeyframeEffect &&
        animation.effect.target === box.dialog &&
        animation.effect.pseudoElement === '::backdrop',
    )
    .forEach((animation) => animation.cancel());
  return animateNode(
    box.dialog,
    { opacity: closing ? [1, 0] : [0, 1] },
    {
      duration: 300,
      pseudoElement: '::backdrop',
      easing: closing ? spec.backdropCloseEasing : spec.backdropOpenEasing,
    },
    { instant: false, signal: box.host.signal },
  );
}

function stopRuns(box: Box): void {
  box.runs.forEach((run) => run.stop());
  box.runs = [];
}

function setExpanded(box: Box, value: boolean): void {
  box.opens.forEach((button) => button.setAttribute('aria-expanded', String(value)));
}

// Немодальное окно — под низом своей секции; пересчёт на resize.
function placeUnderSection(box: Box): void {
  const bottom = box.host.section.getBoundingClientRect().bottom;
  box.dialog.style.position = 'fixed';
  box.dialog.style.top = `${Math.round(bottom)}px`;
}

function announceOpen(box: Box): void {
  if (box.modal) return;
  box.host.root.dispatchEvent(new Event(CLOSE_OTHERS_EVENT, { bubbles: true }));
}

function doOpen(box: Box): void {
  stopRuns(box);
  lockScroll();
  setExpanded(box, true);
  if (box.modal) {
    box.dialog.showModal();
  } else {
    placeUnderSection(box);
    box.dialog.show();
    announceOpen(box);
  }
  if (isInstant(box.host)) {
    box.state = 'open';
    return;
  }
  const panel = panelAnimation(box, false);
  const backdrop = backdropAnimation(box, false);
  box.runs = backdrop === null ? [panel] : [panel, backdrop];
  box.state = 'opening';
  void panel.finished.then(() => {
    if (box.state === 'opening') box.state = 'open';
  });
}

function doCloseNow(box: Box): void {
  stopRuns(box);
  box.dialog.close();
  unlockScroll();
  setExpanded(box, false);
  const focusOpen = box.afterEscape;
  box.afterEscape = false;
  box.state = 'closed';
  if (!box.modal && focusOpen) box.opens[0]?.focus();
}

function doCloseAnimated(box: Box): void {
  if (box.state === 'closed' || box.state === 'closing') return;
  if (isInstant(box.host)) {
    doCloseNow(box);
    return;
  }
  stopRuns(box);
  const panel = panelAnimation(box, true);
  const backdrop = backdropAnimation(box, true);
  box.runs = backdrop === null ? [panel] : [panel, backdrop];
  box.state = 'closing';
  void panel.finished.then(() => {
    if (box.state === 'closing') doCloseNow(box);
  });
}

// Ссылка внутри закрывает сразу, до перехода, без анимации и без preventDefault.
function closeImmediately(box: Box): void {
  box.afterEscape = false;
  doCloseNow(box);
}

const isInside = (event: Event, element: Element): boolean =>
  event.target instanceof Node && element.contains(event.target);

function outsideDialog(box: Box, event: MouseEvent): boolean {
  const rect = box.dialog.getBoundingClientRect();
  return (
    event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
  );
}

function listenOpenButtons(box: Box): void {
  box.opens.forEach((button) =>
    button.addEventListener(
      'click',
      () => {
        if (!box.modal && (box.state === 'open' || box.state === 'opening')) {
          doCloseAnimated(box);
          return;
        }
        doOpen(box);
      },
      { signal: box.host.signal },
    ),
  );
}

function listenEscape(box: Box): void {
  const signal = box.host.signal;
  box.dialog.addEventListener(
    'cancel',
    (event) => {
      event.preventDefault();
      box.afterEscape = true;
      doCloseAnimated(box);
    },
    { signal },
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (box.modal || event.key !== 'Escape' || box.state === 'closed') return;
      box.afterEscape = true;
      doCloseAnimated(box);
    },
    { signal },
  );
}

// Фон модального: клик по самому <dialog> точкой вне его прямоугольника; вне немодального — pointerdown документа.
function listenOutside(box: Box): void {
  const signal = box.host.signal;
  box.dialog.addEventListener(
    'click',
    (event) => {
      if (box.modal && outsideDialog(box, event)) doCloseAnimated(box);
    },
    { signal },
  );
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (box.modal || box.state === 'closed') return;
      const inside = isInside(event, box.dialog) || box.opens.some((button) => isInside(event, button));
      if (!inside) doCloseAnimated(box);
    },
    { signal },
  );
}

function listenCloseAndLinks(box: Box): void {
  const signal = box.host.signal;
  box.dialog
    .querySelectorAll('[data-part="close"]')
    .forEach((button) => button.addEventListener('click', () => doCloseAnimated(box), { signal }));
  box.dialog
    .querySelectorAll('a[href]')
    .forEach((link) => link.addEventListener('click', () => closeImmediately(box), { signal }));
}

// Немодальные окна секции — по одному: чужое открытие закрывает наше; верх окна — снова под низ шапки на resize.
function listenSectionEvents(box: Box): void {
  const signal = box.host.signal;
  box.host.section.addEventListener(
    CLOSE_OTHERS_EVENT,
    (event) => {
      if (event.target !== box.host.root) doCloseAnimated(box);
    },
    { signal },
  );
  if (box.modal) return;
  window.addEventListener(
    'resize',
    () => {
      if (box.state !== 'closed') placeUnderSection(box);
    },
    { signal },
  );
}

function listenClosers(box: Box): void {
  listenEscape(box);
  listenOutside(box);
  listenCloseAndLinks(box);
  listenSectionEvents(box);
}

export const dialog: Behavior<'dialog'> = {
  name: 'dialog',
  attach(host: BehaviorHost): BehaviorInstance {
    const dialogElement = host.root.querySelector<HTMLDialogElement>('[data-part="content"]');
    const opens = [...host.root.querySelectorAll<HTMLElement>('[data-part="open"]')];
    if (dialogElement === null) return {};
    const box: Box = {
      host,
      dialog: dialogElement,
      opens,
      spec: transitionOf(String(host.params.transition), String(host.params.side)),
      modal: host.params.modal === true,
      state: 'closed',
      runs: [],
      afterEscape: false,
    };
    setExpanded(box, false);
    listenOpenButtons(box);
    listenClosers(box);
    return {
      save: () => ({ open: box.state !== 'closed' }),
      restore: (state) => {
        if (typeof state !== 'object' || state === null || !('open' in state) || state.open !== true) return;
        if (box.state === 'closed') doOpen(box);
      },
    };
  },
};
