import type { Animation, EasingName, Keyframes } from '../types';
import { animateNode } from './motion';
import type { Behavior, BehaviorHost, BehaviorInstance } from './types';

// Окно и выезжающая панель (design.md блока 6, раздел 5; факты 10, 12; дополнения блока 7, п. 15): <dialog> и
// showModal/show — браузер, переходы и запрет прокрутки — поведение. Немодальные окна секции — по одному; открытие
// модального окна закрывает немодальные окна своей секции (блок 7, часть 7б). Место немодального окна — data-anchor:
// под своей секцией (умолчание), под шапкой страницы (секция вне шапки, например поверх страниц) или под значком
// корзины (окно «Товар добавлен», как на проде). Запрет прокрутки
// страницы не зависит от модальности: окно запирает её, пока data-lock-scroll не "false" (как на проде: меню, окно
// «Товар добавлен», шторки — запирают; панель поиска — нет).

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
type Anchor = 'section' | 'header' | 'cart';

const CART_ICON = '[data-action="cart.open"]';
const CART_GAP = 12; // между низом значка корзины и верхом окна, px
const CART_MIN_SIDE = 16; // наименьший отступ окна под значком от правого края экрана, px

interface Box {
  readonly host: BehaviorHost;
  readonly dialog: HTMLDialogElement;
  readonly opens: readonly HTMLElement[];
  readonly spec: TransitionSpec;
  readonly modal: boolean;
  readonly locksScroll: boolean;
  readonly anchor: Anchor;
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

// Низ шапки страницы: шапка — секции перед <main> (раскладка страницы: витрина и превью ставят группу header до
// <main>). Наибольший низ; шапка ушла из экрана или спрятана при прокрутке — 0, окно у верха экрана; <main> нет — 0.
function headerBottom(from: HTMLElement): number {
  const doc = from.ownerDocument;
  const main = doc.querySelector('main');
  if (main === null) return 0;
  const bottoms = [...doc.querySelectorAll('merfy-section')]
    .filter((section) => main.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_PRECEDING)
    .map((section) => section.getBoundingClientRect().bottom);
  return Math.max(0, ...bottoms);
}

// Значок корзины страницы (действие cart.open): значков в шапке несколько (телефон, компьютер), виден один — берём
// самый правый из тех, что занимают место. Нет ни одного (шапки нет, значок спрятан) — null.
function cartIconRect(doc: Document): DOMRect | null {
  const boxes = [...doc.querySelectorAll(CART_ICON)]
    .map((icon) => icon.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  return boxes.reduce<DOMRect | null>((far, rect) => (far === null || rect.right > far.right ? rect : far), null);
}

// Под значком корзины, как на проде (anchorToCartIcon): верх — низ значка и зазор; середина окна — под серединой
// значка, правый отступ не меньше CART_MIN_SIDE. left сбрасываем: у открытого <dialog> по умолчанию left: 0. Ширину
// берём замером (у скрытого окна она 0 — doOpen считает место ещё раз после show()). Значка нет — false: окно встаёт
// по правилам data-anchor="header".
function placeUnderCart(box: Box): boolean {
  const { dialog } = box;
  const icon = cartIconRect(dialog.ownerDocument);
  if (icon === null) {
    dialog.style.removeProperty('left');
    dialog.style.removeProperty('right');
    return false;
  }
  const viewport = dialog.ownerDocument.documentElement.clientWidth;
  const axis = icon.left + icon.width / 2;
  const right = Math.max(CART_MIN_SIDE, viewport - axis - dialog.getBoundingClientRect().width / 2);
  dialog.style.top = `${Math.round(Math.max(CART_MIN_SIDE, icon.bottom + CART_GAP))}px`;
  dialog.style.left = 'auto';
  dialog.style.right = `${Math.round(right)}px`;
  return true;
}

// Немодальное окно — под низом своей секции, под шапкой страницы или под значком корзины (data-anchor); пересчёт на
// resize.
function placeNonModal(box: Box): void {
  box.dialog.style.position = 'fixed';
  if (box.anchor === 'cart' && placeUnderCart(box)) return;
  const edge =
    box.anchor === 'section' ? box.host.section.getBoundingClientRect().bottom : headerBottom(box.host.section);
  box.dialog.style.top = `${Math.round(edge)}px`;
}

function announceOpen(box: Box): void {
  box.host.root.dispatchEvent(new Event(CLOSE_OTHERS_EVENT, { bubbles: true }));
}

function doOpen(box: Box): void {
  stopRuns(box);
  if (box.locksScroll) lockScroll();
  setExpanded(box, true);
  if (box.modal) {
    box.dialog.showModal();
  } else {
    // Место — до show(): показанное окно берёт фокус, и пока оно не fixed, страница прокручивается к нему. Под значком
    // корзины ширина окна известна только у показанного — второй раз после show().
    placeNonModal(box);
    box.dialog.show();
    if (box.anchor === 'cart') placeNonModal(box);
  }
  announceOpen(box);
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
  if (box.locksScroll) unlockScroll();
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

// Немодальные окна секции — по одному: чужое открытие закрывает наше; верх окна — на resize снова по своему месту.
function listenSectionEvents(box: Box): void {
  const signal = box.host.signal;
  box.host.section.addEventListener(
    CLOSE_OTHERS_EVENT,
    (event) => {
      if (!box.modal && event.target !== box.host.root) doCloseAnimated(box);
    },
    { signal },
  );
  if (box.modal) return;
  window.addEventListener(
    'resize',
    () => {
      if (box.state !== 'closed') placeNonModal(box);
    },
    { signal },
  );
}

// Открытие по событию SDK (блок 10, Р10а-6): ядро копирует события на document; закрытое окно открывается.
// Окно открывает только событие при закрытом окне: нажатие на значок, который это событие шлёт, закрывает открытое
// немодальное окно как «нажатие вне окна», и следующий за ним клик его не открывает снова.
const OPEN_EVENTS: Readonly<Record<string, string>> = {
  'cart-open': 'merfy:cart:open',
  'cart-add': 'merfy:cart:add',
  'search-open': 'merfy:search:open',
};

function listenOpenEvent(box: Box): void {
  const name = OPEN_EVENTS[String(box.host.params['open-on'])];
  if (name === undefined) return;
  // Блок 12, часть 12а: у секции со сбоем (data-merfy-state="failed") окно по событию SDK не открывается — «Товар
  // добавлен» со сломанным скриптом не показывает пустое окно, меняется только число в «Корзине».
  const open = (): void => {
    if (box.state === 'closed' && box.host.section.getAttribute('data-merfy-state') !== 'failed') doOpen(box);
  };
  document.addEventListener(name, open, { signal: box.host.signal });
}

function listenClosers(box: Box): void {
  listenEscape(box);
  listenOutside(box);
  listenCloseAndLinks(box);
  listenSectionEvents(box);
}

// Секцию с открытым окном заменили или убрали (список «Каталога» после выбора фильтров): запрет прокрутки снимается,
// иначе страница остаётся запертой. Состояние «закрыто» — чтобы отложенное закрытие не сняло запрет второй раз.
function releaseOnDetach(box: Box): void {
  box.host.signal.addEventListener(
    'abort',
    () => {
      if (box.state === 'closed') return;
      box.state = 'closed';
      stopRuns(box);
      if (box.locksScroll) unlockScroll();
    },
    { once: true },
  );
}

const anchorOf = (value: unknown): Anchor => (value === 'header' || value === 'cart' ? value : 'section');

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
      locksScroll: host.params['lock-scroll'] === true,
      anchor: anchorOf(host.params.anchor),
      state: 'closed',
      runs: [],
      afterEscape: false,
    };
    setExpanded(box, false);
    listenOpenButtons(box);
    listenOpenEvent(box);
    listenClosers(box);
    releaseOnDetach(box);
    return {
      save: () => ({ open: box.state !== 'closed' }),
      restore: (state) => {
        if (typeof state !== 'object' || state === null || !('open' in state) || state.open !== true) return;
        if (box.state === 'closed') doOpen(box);
      },
    };
  },
};
