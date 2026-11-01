import { motionPrefs } from '../behaviors/prefs';
import { failed, failureOf, reportFailure } from '../failures';
import { OVERLAY_HIDE_EVENT, OVERLAY_SHOW_EVENT } from '../preview-protocol';
import { OVERLAY_ATTRIBUTE, OVERLAY_PART } from '../roles';
import { lockScroll, unlockScroll } from '../scroll-lock';
import { atom, readable, type Atom } from '../stores';
import type {
  CoreHandle,
  InstanceHost,
  NoData,
  OverlayCloseReason,
  OverlayOptions,
  OverlayPosition,
  OverlayWindow,
  Result,
  SdkPart,
} from '../types';

// Окна поверх страницы (01.11): секция без роли в группе overlay — окно, ctx.overlay открывает и закрывает его. Часть —
// в бандле страниц, где стоит такая секция (сборка, code.ts): бюджет ядра 16 КБ без неё; в core-parts.json и uses её нет.
// Окно — сама <merfy-section>: сборка ставит на неё data-overlay и hidden, часть — popover="manual" (верхний слой
// страницы), role="dialog" и tabindex="-1".
// center и sheet — модальные: aria-modal, фон-подложка под окном (клик по нему закрывает, backdrop — затемнение),
// фокус внутрь и по кругу на Tab, запрет прокрутки (scroll-lock.ts, общий с поведением dialog); таких окон открыто не
// больше одного. corner — немодальное: фокус не уводит, страница работает; одно, может стоять рядом с модальным (окно
// согласия или чат не мешают окну по центру). Второе окно того же вида — отказ refused: очередь показала бы окно позже, к
// другому месту страницы. Esc закрывает модальное окно, а без него — угловое, если фокус в нём; при закрытии фокус
// возвращается туда, где был. На телефоне угол — шторкой снизу (CSS ниже), «уменьшить движение» — без анимаций.
// Превью: выбор секции в конструкторе открывает окно (OVERLAY_SHOW_EVENT) с последними параметрами её скрипта, фокус
// окна в превью не берут — он у полей конструктора.

const STYLE_ID = 'merfy-overlay';
const BACKDROP_ATTRIBUTE = 'data-merfy-overlay-backdrop';
const POSITIONS: readonly OverlayPosition[] = ['center', 'corner', 'sheet'];
const OPEN_MS = 200;
const CLOSE_MS = 150;
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
// Новый объект на каждый ответ: ответ уходит в код секции.
const ok = (): Result<NoData> => ({ ok: true, data: {} });

// Место окна. <merfy-section> — прозрачный слой места: по центру — весь экран с полями 16px, в углу — полоса над низом
// экрана, шторка — низ во всю ширину; клики слой пропускает (pointer-events), их ловят окно, подложка или страница. Окно —
// корень шаблона: ширину задают его классы (w-full max-w-md — до 28rem, не шире слоя), без них — по содержимому; у
// шторки корень во всю ширину. Слой — колонка flex, поэтому w-full корня считается от слоя, а не от ширины по содержимому
// (у popover браузер ставит fit-content). display — только у :popover-open: без popover окно остаётся hidden. Телефон —
// до 48rem, как у панели фильтров каталога (behaviors/catalog-list.ts). Общие настройки секции — окну: правила слоя вне
// слоёв CSS главнее покраски схемы (@layer base) и отступов (@layer utilities) на обёртке, поэтому слой прозрачен и без
// отступов; токены схемы корень наследует, и ядро красит его так же, как токены красят секцию, — в @layer base, где
// классы шаблона (bg-*, text-*) главнее; отступы сборщик ставит корню вариантом `*:` (wrapper.ts пакета секций).
// Функцией, а не значением модуля: модуль без окон на странице не оставляет в бандле ядра ничего.
const OVERLAY = 'merfy-section[data-overlay]';
const FULL_WIDTH = 'width:100%;max-width:none';
const cssText = (): string => `:where(${OVERLAY}){border:0;padding:0;color:inherit;background:transparent}\
${OVERLAY}{position:fixed;inset:auto;margin:0;box-sizing:border-box;width:auto;height:auto;max-width:100vw;max-height:100dvh;overflow:auto;flex-direction:column;pointer-events:none}\
${OVERLAY}:popover-open{display:flex}\
:where(${OVERLAY})>*{pointer-events:auto}\
${OVERLAY}[data-position="center"]{inset:0;padding:16px;align-items:center;justify-content:center;justify-content:safe center}\
${OVERLAY}[data-position="sheet"]{inset:auto 0 0 0}\
${OVERLAY}[data-position="sheet"]>*{${FULL_WIDTH}}\
${OVERLAY}[data-position="corner"]{left:16px;right:16px;bottom:16px;align-items:flex-end}\
${OVERLAY}[data-position="corner"][data-side="left"]{align-items:flex-start}\
[${BACKDROP_ATTRIBUTE}]{position:fixed;inset:0;width:auto;height:auto;margin:0;padding:0;border:0;background:transparent}\
[${BACKDROP_ATTRIBUTE}][data-dim]{background:rgb(0 0 0 / 0.5)}\
@media (max-width:47.99rem){${OVERLAY}[data-position="corner"]{inset:auto 0 0 0;align-items:stretch}\
${OVERLAY}[data-position="corner"]>*{${FULL_WIDTH}}}\
@layer base{${OVERLAY}>*{background-color:var(--background);color:var(--foreground)}}`;

interface Placement {
  readonly position: OverlayPosition;
  readonly side: 'left' | 'right';
  readonly backdrop: boolean;
  readonly modal: boolean;
}

interface Box {
  readonly host: InstanceHost;
  readonly page: OverlayPage;
  readonly open: Atom<boolean>;
  placement: Placement | null; // открыто — где и как; null — закрыто
  returnTo: HTMLElement | null; // куда вернуть фокус
  runs: Animation[];
}

// Окно экземпляра и его ctx.overlay: один объект на экземпляр, замена в превью заводит новый.
interface Entry {
  readonly box: Box;
  readonly window: OverlayWindow;
}

interface OverlayPage {
  readonly core: CoreHandle;
  readonly boxes: WeakMap<HTMLElement, Entry>;
  readonly remembered: Map<string, OverlayOptions | undefined>; // превью: последние параметры open() по id секции
  modal: Box | null;
  corner: Box | null;
  backdrop: HTMLElement | null;
  listening: boolean;
}

// API части для ядра (ctx.overlay экземпляра, instance.ts); секциям не отдаётся.
export interface OverlayApi {
  windowOf(host: InstanceHost): OverlayWindow | null; // не окно поверх страницы — null
  close(section: HTMLElement | undefined, reason: OverlayCloseReason): Result<NoData>; // окно этой секции
}

const popoverWorks = (element: HTMLElement): boolean => typeof element.showPopover === 'function';
// Показан ли popover: браузер, который не знает :popover-open, бросает SyntaxError — тогда не показан.
function shown(element: HTMLElement): boolean {
  try {
    return popoverWorks(element) && element.matches(':popover-open');
  } catch {
    return false;
  }
}
const refused = (message: string): Result<NoData> => ({ ok: false, error: { code: 'refused', message } });

function invalid(page: OverlayPage, message: string): Result<NoData> {
  const failure = failureOf('invalid', `ctx.overlay: ${message}`);
  reportFailure(page.core, failure);
  return failed(failure);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isPosition = (value: unknown): value is OverlayPosition => POSITIONS.some((position) => position === value);

// Параметры open(): где окно и есть ли затемнение. Неверное значение — текст для автора.
function placementOf(options: unknown): Placement | string {
  const raw = options === undefined ? {} : options;
  if (!isRecord(raw)) return 'параметры open() — объект { position, side, backdrop }';
  const position = raw.position ?? 'center';
  if (!isPosition(position)) return `position — center, corner или sheet, а не ${JSON.stringify(raw.position)}`;
  const side = raw.side ?? 'right';
  if (side !== 'left' && side !== 'right') return `side — left или right, а не ${JSON.stringify(raw.side)}`;
  const modal = position !== 'corner';
  const backdrop = raw.backdrop ?? modal;
  if (typeof backdrop !== 'boolean') return 'backdrop — true или false';
  if (!modal && backdrop) return 'у окна в углу (corner) затемнения нет: backdrop — только у center и sheet';
  return { position, side, backdrop, modal };
}

function ensureStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID) !== null) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = cssText();
  doc.head.append(style);
}

// Подложка модального окна — одна на страницу, свой popover: показанная перед окном, она лежит под ним в верхнем слое и
// ловит клики мимо окна (у ::backdrop popover клики проходят на страницу).
function backdropOf(page: OverlayPage, doc: Document): HTMLElement {
  if (page.backdrop !== null && page.backdrop.isConnected) return page.backdrop;
  const backdrop = doc.createElement('div');
  backdrop.setAttribute(BACKDROP_ATTRIBUTE, '');
  backdrop.setAttribute('popover', 'manual');
  backdrop.hidden = true;
  backdrop.addEventListener('click', () => {
    if (page.modal !== null) closeBox(page.modal, 'backdrop');
  });
  doc.body.append(backdrop);
  page.backdrop = backdrop;
  return backdrop;
}

function showBackdrop(page: OverlayPage, doc: Document, dim: boolean): HTMLElement {
  const backdrop = backdropOf(page, doc);
  backdrop.toggleAttribute('data-dim', dim);
  backdrop.hidden = false;
  if (!shown(backdrop)) backdrop.showPopover();
  return backdrop;
}

function hideBackdrop(page: OverlayPage): void {
  const backdrop = page.backdrop;
  if (backdrop === null) return;
  if (shown(backdrop)) backdrop.hidePopover();
  backdrop.hidden = true;
}

const reduced = (box: Box): boolean => motionPrefs(window, box.host.mode).reduced;

const FROM: Readonly<Record<OverlayPosition, string>> = {
  center: 'scale(0.96)',
  corner: 'translateY(16px)',
  sheet: 'translateY(100%)',
};

// Переход окна и подложки: появление — 200 мс, уход — 150 мс; «уменьшить движение» и браузер без WAAPI — сразу.
function animateBox(box: Box, placement: Placement, closing: boolean): Animation[] {
  const element = box.host.element;
  if (reduced(box) || typeof element.animate !== 'function') return [];
  const timing = { duration: closing ? CLOSE_MS : OPEN_MS, easing: 'ease-out' };
  const frames = [
    { opacity: 0, transform: FROM[placement.position] },
    { opacity: 1, transform: 'none' },
  ];
  const runs = [element.animate(closing ? [...frames].reverse() : frames, timing)];
  const backdrop = box.page.backdrop;
  if (placement.modal && backdrop !== null) runs.push(backdrop.animate({ opacity: closing ? [1, 0] : [0, 1] }, timing));
  return runs;
}

function stopRuns(box: Box): void {
  box.runs.forEach((run) => run.cancel());
  box.runs = [];
}

// Окно спрятано: popover закрыт, снова hidden, место — из атрибутов.
function hideNow(box: Box): void {
  stopRuns(box);
  const element = box.host.element;
  if (shown(element)) element.hidePopover();
  element.hidden = true;
  ['data-position', 'data-side', 'aria-modal'].forEach((name) => element.removeAttribute(name));
}

const focusablesOf = (element: HTMLElement): HTMLElement[] =>
  [...element.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((node) => node.getClientRects().length > 0);

// Фокус внутрь модального окна: [autofocus], первый доступный элемент или само окно (tabindex="-1").
function focusInside(element: HTMLElement): void {
  const target = element.querySelector<HTMLElement>('[autofocus]') ?? focusablesOf(element)[0] ?? element;
  target.focus({ preventScroll: true });
}

function activeOutside(element: HTMLElement): HTMLElement | null {
  const active = element.ownerDocument.activeElement;
  return active instanceof HTMLElement && !element.contains(active) ? active : null;
}

function place(box: Box, placement: Placement): void {
  const element = box.host.element;
  element.setAttribute('data-position', placement.position);
  element.setAttribute('data-side', placement.side);
  if (placement.modal) element.setAttribute('aria-modal', 'true');
  else element.removeAttribute('aria-modal');
}

function showBox(box: Box, placement: Placement): void {
  const { element } = box.host;
  const doc = element.ownerDocument;
  const page = box.page;
  ensureStyle(doc);
  stopRuns(box);
  place(box, placement);
  box.returnTo = activeOutside(element);
  if (placement.modal) {
    showBackdrop(page, doc, placement.backdrop);
    lockScroll(doc);
  }
  element.hidden = false;
  if (!shown(element)) element.showPopover();
  box.placement = placement;
  if (placement.modal) page.modal = box;
  else page.corner = box;
  box.open.set(true);
  box.runs = animateBox(box, placement, false);
  if (placement.modal && page.core.mode !== 'preview') focusInside(element);
}

function openBox(box: Box, options: OverlayOptions | undefined): Result<NoData> {
  const placement = placementOf(options);
  if (typeof placement === 'string') return invalid(box.page, placement);
  if (box.placement !== null) return ok();
  if (box.host.signal.aborted) return refused('секция уже снята со страницы');
  if (!popoverWorks(box.host.element)) return refused('браузер не показывает окна поверх страницы');
  const taken = placement.modal ? box.page.modal : box.page.corner;
  if (taken !== null)
    return refused(`открыто окно секции ${taken.host.name}: одновременно — одно окно этого вида, закройте его`);
  box.page.remembered.set(box.host.id, options);
  showBox(box, placement);
  return ok();
}

// Фокус — туда, где был до открытия: у модального окна всегда, у углового — если фокус был в окне.
function returnFocus(box: Box, placement: Placement): void {
  const element = box.host.element;
  const inside = element.contains(element.ownerDocument.activeElement);
  const target = box.returnTo;
  box.returnTo = null;
  if ((placement.modal || inside) && target !== null && target.isConnected) target.focus({ preventScroll: true });
}

// reason null — окно снято вместе с экземпляром: без события и анимации.
function closeBox(box: Box, reason: OverlayCloseReason | null): Result<NoData> {
  const placement = box.placement;
  if (placement === null) return ok();
  const page = box.page;
  box.placement = null;
  if (page.modal === box) page.modal = null;
  if (page.corner === box) page.corner = null;
  box.open.set(false);
  returnFocus(box, placement);
  if (placement.modal) unlockScroll(box.host.element.ownerDocument);
  if (reason === null) {
    if (placement.modal) hideBackdrop(page);
    hideNow(box);
    return ok();
  }
  page.core.emit('merfy:overlay:close', { section: box.host.name, id: box.host.id, reason });
  finishClose(box, placement);
  return ok();
}

// Уход с анимацией: окно прячется после неё, если его не открыли снова; подложка — сразу, если модального больше нет.
function finishClose(box: Box, placement: Placement): void {
  stopRuns(box);
  const runs = animateBox(box, placement, true);
  box.runs = runs;
  const done = (): void => {
    if (box.placement !== null) return;
    if (placement.modal && box.page.modal === null) hideBackdrop(box.page);
    hideNow(box);
  };
  if (runs.length === 0) return done();
  void Promise.all(runs.map((run) => run.finished)).then(done, () => undefined);
}

// Tab по кругу внутри модального окна; фокус снаружи — на первый элемент окна.
function trapTab(element: HTMLElement, event: KeyboardEvent): void {
  const list = focusablesOf(element);
  const first = list[0] ?? element;
  const last = list.at(-1) ?? element;
  const active = element.ownerDocument.activeElement;
  const outside = !(active instanceof Node) || !element.contains(active);
  const wrap = event.shiftKey ? active === first || active === element : active === last;
  if (!outside && !wrap) return;
  event.preventDefault();
  (event.shiftKey && !outside ? last : first).focus({ preventScroll: true });
}

function cornerWithFocus(page: OverlayPage): Box | null {
  const corner = page.corner;
  if (corner === null) return null;
  return corner.host.element.contains(corner.host.element.ownerDocument.activeElement) ? corner : null;
}

function onKey(page: OverlayPage, event: KeyboardEvent): void {
  if (event.key === 'Tab' && page.modal !== null) return trapTab(page.modal.host.element, event);
  if (event.key !== 'Escape') return;
  const box = page.modal ?? cornerWithFocus(page);
  if (box === null) return;
  event.preventDefault();
  closeBox(box, 'escape');
}

function listenPage(page: OverlayPage, doc: Document): void {
  if (page.listening) return;
  page.listening = true;
  doc.addEventListener('keydown', (event) => onKey(page, event), true);
}

// Подпись окна для читалок экрана — первый заголовок секции (aria-labelledby); заголовка нет — без подписи.
function labelOf(element: HTMLElement, id: string): void {
  const heading = element.querySelector<HTMLElement>('h1, h2, h3, h4, h5, h6');
  if (heading === null) return;
  if (heading.id === '') heading.id = `merfy-overlay-${id}-title`;
  element.setAttribute('aria-labelledby', heading.id);
}

// Превью: выбор секции — окно с последними параметрами её скрипта; чужое окно того же вида закрывается.
function listenPreview(box: Box): void {
  const { element, signal, id } = box.host;
  element.addEventListener(
    OVERLAY_SHOW_EVENT,
    () => {
      const placement = placementOf(box.page.remembered.get(id));
      const taken = typeof placement === 'string' || placement.modal ? box.page.modal : box.page.corner;
      if (taken !== null && taken !== box) closeBox(taken, 'code');
      openBox(box, box.page.remembered.get(id));
    },
    { signal },
  );
  element.addEventListener(OVERLAY_HIDE_EVENT, () => closeBox(box, 'code'), { signal });
}

function windowOfBox(box: Box): OverlayWindow {
  return Object.freeze({
    $open: readable(box.open),
    open: (options?: OverlayOptions) => openBox(box, options),
    close: () => closeBox(box, 'code'),
  });
}

// Окно экземпляра: popover, роль и подпись; снятие экземпляра (замена в превью, уход узла) закрывает окно без события.
function register(page: OverlayPage, host: InstanceHost): Entry {
  const { element } = host;
  const box: Box = { host, page, open: atom(false), placement: null, returnTo: null, runs: [] };
  const entry: Entry = { box, window: windowOfBox(box) };
  if (popoverWorks(element)) element.setAttribute('popover', 'manual');
  element.setAttribute('role', 'dialog');
  element.setAttribute('tabindex', '-1');
  labelOf(element, host.id);
  page.boxes.set(element, entry);
  listenPage(page, element.ownerDocument);
  if (host.mode === 'preview') listenPreview(box);
  host.signal.addEventListener(
    'abort',
    () => {
      closeBox(box, null);
      if (page.boxes.get(element) === entry) page.boxes.delete(element);
    },
    { once: true },
  );
  return entry;
}

function windowOf(page: OverlayPage, host: InstanceHost): OverlayWindow | null {
  if (!host.element.hasAttribute(OVERLAY_ATTRIBUTE) || host.signal.aborted) return null;
  const known = page.boxes.get(host.element);
  if (known !== undefined && known.box.host.signal === host.signal) return known.window;
  return register(page, host).window;
}

function closeFrom(page: OverlayPage, section: HTMLElement | undefined, reason: OverlayCloseReason): Result<NoData> {
  const entry = section === undefined ? undefined : page.boxes.get(section);
  if (entry === undefined) return invalid(page, 'overlay.close — только в секции поверх страницы (группа overlay)');
  return closeBox(entry.box, reason);
}

export const overlay: SdkPart<typeof OVERLAY_PART, OverlayApi> = {
  name: OVERLAY_PART,
  create: (core: CoreHandle): OverlayApi => {
    const page: OverlayPage = {
      core,
      boxes: new WeakMap(),
      remembered: new Map(),
      modal: null,
      corner: null,
      backdrop: null,
      listening: false,
    };
    return {
      windowOf: (host) => windowOf(page, host),
      close: (section, reason) => closeFrom(page, section, reason),
    };
  },
  markup: {
    close: {
      params: [],
      call: (api: OverlayApi, _values, _event, section): Promise<Result<unknown>> =>
        Promise.resolve(api.close(section, 'button')),
    },
  },
};
