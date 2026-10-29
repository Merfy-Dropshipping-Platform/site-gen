import { NOTICE_TEXT } from '../failures';
import { PREVIEW_LIST_EVENT } from '../preview-protocol';
import type { Behavior, BehaviorHost } from './types';

// Поведение catalog (блок 11 «Секций и SDK», 11.3, 11.4; Р11б-14…Р11б-18). В адресной строке покупателя — только q и
// collection (как на проде, факт 18); номер — пока фильтры не выбраны.
export const LIST_ADDRESS_PARAMS: readonly string[] = ['q', 'collection'];
export const SCROLL_MARGIN = '200px';
const PAGE_PATH = /\/page\/(\d+)$/;

// Есть ли в адресе параметры списка, кроме номера. С ними, как на проде (факт 18; приёмка блока 11, 25.10), номер
// страницы в адрес при листании не попадает: строки дописываются без смены адреса.
const filtersChosen = (url: URL): boolean => [...url.searchParams.keys()].some((name) => name !== 'page');

// Есть ли у запроса параметры списка, кроме номера: ответ тогда — от рисовальщика с <meta name="merfy-list">.
export const listParamsIn = (url: URL): boolean => [...url.searchParams.keys()].some((name) => name !== 'page');

// Адрес для history.replaceState (Р11б-16); null — адрес не меняется.
export function addressOf(url: URL, how: 'page' | 'filters'): string | null {
  if (how === 'page') return filtersChosen(url) ? null : `${url.pathname}${url.search}`;
  const kept = new URLSearchParams([...url.searchParams].filter(([name]) => LIST_ADDRESS_PARAMS.includes(name)));
  const search = kept.toString();
  return `${url.pathname.replace(PAGE_PATH, '')}${search === '' ? '' : `?${search}`}`;
}

// Параметры списка для превью (Р11б-18): канонический вид — имена по алфавиту, номер из /page/N, page=1 не пишется.
export function previewListOf(url: URL): string {
  const params = new URLSearchParams([...url.searchParams].filter(([name]) => name !== 'page'));
  const page = Number(PAGE_PATH.exec(url.pathname)?.[1] ?? url.searchParams.get('page') ?? '1');
  if (Number.isInteger(page) && page > 1) params.append('page', String(page));
  params.sort();
  return params.toString();
}

type How = 'end' | 'start' | 'replace';
type Reason = 'server' | 'network';

interface Load {
  readonly how: How;
  readonly url: URL;
  readonly controller: AbortController;
}

const partOf = (host: BehaviorHost, name: string): HTMLElement | null =>
  host.root.querySelector<HTMLElement>(`[data-part="${name}"]`);

const rowsOf = (list: HTMLElement): readonly HTMLElement[] =>
  [...list.children].filter((child): child is HTMLElement => child instanceof HTMLElement);

// Секция ответа с тем же data-section-id (сравнение getAttribute, без CSS.escape); kind — какая проверка ответа.
function sectionFrom(text: string, sectionId: string, wantsMeta: boolean): HTMLElement | null {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  if (wantsMeta && doc.querySelector('meta[name="merfy-list"]') === null) return null;
  const sections = [...doc.querySelectorAll('merfy-section')].filter((one): one is HTMLElement => one instanceof HTMLElement);
  return sections.find((one) => one.getAttribute('data-section-id') === sectionId) ?? null;
}

// Копии прежних строк — в новую секцию (Р11б-14); возвращает число новых строк (до копий).
function carryOver(fresh: HTMLElement, host: BehaviorHost, how: How): number {
  const oldList = partOf(host, 'list');
  const freshList = fresh.querySelector<HTMLElement>('[data-part="list"]');
  if (oldList === null || freshList === null) return 0;
  const freshRows = rowsOf(freshList).length;
  const copies = rowsOf(oldList).map((row) => row.cloneNode(true));
  if (how === 'end') freshList.prepend(...copies);
  if (how === 'start') freshList.append(...copies);
  carryLink(fresh, host, how);
  return freshRows;
}

// «Показать ещё» приносит прежний prev, «Показать предыдущие» — прежний next; у старой ссылки нет — новую убрать.
function carryLink(fresh: HTMLElement, host: BehaviorHost, how: How): void {
  if (how === 'replace') return;
  const name = how === 'end' ? 'prev' : 'next';
  const freshLink = fresh.querySelector<HTMLElement>(`[data-part="${name}"]`);
  const oldLink = partOf(host, name);
  if (oldLink === null) freshLink?.remove();
  else freshLink?.replaceWith(oldLink.cloneNode(true));
}

const groupsOf = (root: ParentNode): readonly HTMLDetailsElement[] =>
  [...root.querySelectorAll<HTMLDetailsElement>('details[data-group]')];

// Группы фильтров («Сортировать», «Наличие»…) — раскрыты или свёрнуты, как оставил покупатель: ответ приходит со своим
// состоянием по умолчанию, а секция заменяется целиком. Группа — по data-group.
function carryGroups(fresh: HTMLElement, host: BehaviorHost): void {
  const opened = new Map(groupsOf(host.section).map((group) => [group.getAttribute('data-group'), group.open]));
  groupsOf(fresh).forEach((group) => {
    const state = opened.get(group.getAttribute('data-group'));
    if (state !== undefined) group.open = state;
  });
}

// Поле с фокусом: замена секции не должна его отнимать — переход Tab из «от» в «до» после применения цены, стрелки по
// пунктам. Поле в новой секции — по имени (и значению, если у пунктов имя общее, как у радио).
interface Focused {
  readonly name: string;
  readonly value: string;
}

function focusedIn(section: HTMLElement): Focused | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement) || !section.contains(active) || active.name === '') return null;
  return { name: active.name, value: active.type === 'text' ? '' : active.value };
}

function restoreFocus(section: HTMLElement, focused: Focused | null): void {
  if (focused === null) return;
  const same = [...section.querySelectorAll<HTMLInputElement>('input')].filter((input) => input.name === focused.name);
  (same.find((input) => input.value === focused.value) ?? same[0])?.focus({ preventScroll: true });
}

function applyFresh(host: BehaviorHost, fresh: HTMLElement, url: URL, how: How, freshRows: number): void {
  const list = fresh.querySelector<HTMLElement>('[data-part="list"]');
  const total = list === null ? 0 : rowsOf(list).length;
  const count = fresh.querySelector<HTMLElement>('[data-part="count"]');
  if (count !== null) count.textContent = String(total);
  const status = fresh.querySelector<HTMLElement>('[data-part="status"]');
  if (status !== null) status.textContent = how === 'replace' ? `Показано ${total}` : `Загружено ещё ${freshRows}`;
  carryGroups(fresh, host);
  const focused = focusedIn(host.section);
  const next = document.importNode(fresh, true);
  host.section.replaceWith(next);
  restoreFocus(next, focused);
  if (host.motion.preview) return;
  replaceAddress(url, how);
  const page = Number(list?.getAttribute('data-page'));
  host.core?.emit('merfy:catalog:page', { page: Number.isInteger(page) && page > 0 ? page : 1 });
}

function replaceAddress(url: URL, how: How): void {
  const address = addressOf(url, how === 'replace' ? 'filters' : 'page');
  if (address !== null) window.history.replaceState(window.history.state, '', address);
}

interface Session {
  readonly host: BehaviorHost;
  readonly list: HTMLElement;
  readonly sectionId: string;
  current: Load | null;
}

const busy = (session: Session, on: boolean): void => {
  if (on) session.list.setAttribute('aria-busy', 'true');
  else session.list.removeAttribute('aria-busy');
};

const fail = (session: Session, reason: Reason): void => {
  session.current = null;
  busy(session, false);
  session.host.core?.emit('merfy:notice:show', { level: 'error', message: NOTICE_TEXT[reason], code: reason });
};

// В превью раздачи нет: HTML секции даёт ответ превью через reply (Р11б-18).
function loadPreview(session: Session, load: Load): void {
  const detail = { list: previewListOf(load.url), reply: (html: string): void => applyReply(session, html, load) };
  const event = new CustomEvent(PREVIEW_LIST_EVENT, { bubbles: true, cancelable: true, detail });
  session.host.root.dispatchEvent(event);
  if (event.defaultPrevented) return;
  session.current = null; // никто не ответил — список прежний
  busy(session, false);
}

function applyReply(session: Session, html: string, load: Load): void {
  if (session.current !== load) return; // ответ на отменённую загрузку не применяется
  const fresh = sectionFrom(`<body>${html}</body>`, session.sectionId, false);
  if (fresh === null) return;
  const { host } = session;
  applyFresh(host, fresh, load.url, load.how, carryOver(fresh, host, load.how));
}

async function loadLive(session: Session, load: Load): Promise<void> {
  try {
    const response = await fetch(load.url.href, {
      signal: load.controller.signal,
      credentials: 'same-origin',
      headers: { accept: 'text/html' },
    });
    if (!response.ok) return fail(session, 'server');
    const fresh = sectionFrom(await response.text(), session.sectionId, listParamsIn(load.url));
    if (fresh === null) return fail(session, 'server');
    const { host } = session;
    applyFresh(host, fresh, load.url, load.how, carryOver(fresh, host, load.how));
  } catch {
    if (load.controller.signal.aborted) return; // отмена — тихо
    fail(session, 'network');
  }
}

function load(session: Session, how: How, url: URL): void {
  if (how === 'replace') session.current?.controller.abort();
  else if (session.current !== null) return; // «в конец» и «в начало» во время загрузки не запускаются
  const controller = new AbortController();
  session.host.signal.addEventListener('abort', () => controller.abort(), { once: true });
  session.current = { how, url, controller };
  busy(session, true);
  const next = session.current;
  if (session.host.motion.preview) loadPreview(session, next);
  else void loadLive(session, next);
}

function listenPaging(session: Session): void {
  const paging = session.host.params.paging;
  if (paging === 'pages') {
    // В режиме номеров листают ссылки номеров: «Показать ещё» и «Показать предыдущие» спрятаны, как на проде
    // (приёмка блока 11, 25.10).
    const next = partOf(session.host, 'next');
    if (next !== null) next.hidden = true;
    const prev = partOf(session.host, 'prev');
    if (prev !== null) prev.hidden = true;
    return;
  }
  const pages = partOf(session.host, 'pages');
  if (pages !== null) pages.hidden = true;
  listenLink(session, 'next', 'end');
  listenLink(session, 'prev', 'start');
  if (paging === 'scroll') listenScroll(session);
}

function listenLink(session: Session, name: 'next' | 'prev', how: How): void {
  const link = partOf(session.host, name);
  link?.addEventListener('click', (event) => {
    event.preventDefault();
    load(session, how, new URL(link.getAttribute('href') ?? '', location.href));
  });
}

function listenScroll(session: Session): void {
  const next = partOf(session.host, 'next');
  if (next === null || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      load(session, 'end', new URL(next.getAttribute('href') ?? '', location.href));
    },
    { rootMargin: SCROLL_MARGIN },
  );
  observer.observe(next);
  session.host.signal.addEventListener('abort', () => observer.disconnect(), { once: true });
}

// Адрес формы фильтров: action с параметрами FormData по порядку, без пустых строк и page (Р11б-17).
function formUrlOf(form: HTMLFormElement): URL {
  const action = new URL(form.getAttribute('action') ?? location.pathname, location.href);
  const fields = [...new FormData(form)].filter(
    (entry): entry is [string, string] => entry[0] !== 'page' && typeof entry[1] === 'string' && entry[1] !== '',
  );
  action.search = new URLSearchParams(fields).toString();
  return action;
}

function listenFilters(session: Session): void {
  const form = partOf(session.host, 'filters');
  if (!(form instanceof HTMLFormElement)) return;
  const run = (): void => load(session, 'replace', formUrlOf(form));
  // Выбор в поле применяется сразу; в открытом окне (фильтры на телефоне) — по кнопке отправки формы: замена секции
  // закрыла бы окно после первого же выбора. Отправка формы (кнопка, Enter в поле) применяет всегда.
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    run();
  });
  form.addEventListener('change', (event) => {
    const inOpenDialog = event.target instanceof Element && event.target.closest('dialog[open]') !== null;
    if (!inOpenDialog) run();
  });
}

// Фильтры сверху на компьютере (md и шире): раскрытая группа — панель под заголовком, нажатие вне панели её закрывает;
// открывая одну группу, другие закрываются так же (нажатие по заголовку — вне чужой панели). Сбоку и в шторке
// телефона группы — обычный список, сами не закрываются.
const PANEL_QUERY = '(min-width: 48rem)';

function listenPanels(session: Session): void {
  const { root, signal } = session.host;
  document.addEventListener(
    'click',
    (event) => {
      const opened = groupsOf(root).filter((group) => group.open);
      if (opened.length === 0 || root.getAttribute('data-filters-side') === 'true') return;
      if (!window.matchMedia(PANEL_QUERY).matches) return;
      opened
        .filter((group) => !(event.target instanceof Node && group.contains(event.target)))
        .forEach((group) => group.removeAttribute('open'));
    },
    { signal },
  );
}

export const catalog: Behavior<'catalog'> = {
  name: 'catalog',
  attach(host: BehaviorHost) {
    const list = partOf(host, 'list');
    if (list === null) return {};
    const session: Session = {
      host,
      list,
      sectionId: host.section.getAttribute('data-section-id') ?? '',
      current: null,
    };
    listenPaging(session);
    listenFilters(session);
    listenPanels(session);
    return {};
  },
};
