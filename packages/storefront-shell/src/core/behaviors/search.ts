import { checkAttributeWrite } from '../attributes';
import type { SearchItem, SearchModule } from '../types';
import type { Behavior, BehaviorHost } from './types';

// Поведение search (блок 11 «Секций и SDK», часть 11б-2; design.md 11.5, Р11б-19, Р11б-20): подсказки поиска в панели
// секции «Поиск» — строки по шаблону, «Ничего не нашли», «Все результаты», отправка и открытие панели.

export const SEARCH_PAUSE_MS = 250;

const NO_MODULE_TEXT =
  'Поведение search: на странице нет модуля «Поиск» — в section.json секции нужен "uses": ["search"]';

const partOf = (host: BehaviorHost, name: string): HTMLElement | null =>
  host.root.querySelector<HTMLElement>(`[data-part="${name}"]`);

// Атрибут проходит ту же границу, что El.attr: неверный адрес — строка без него.
function setAttr(el: HTMLElement, tag: string, name: string, value: string): void {
  try {
    el.setAttribute(checkAttributeWrite(tag, name, value), value);
  } catch {
    return;
  }
}

interface Parts {
  readonly input: HTMLInputElement;
  readonly results: HTMLElement;
  readonly row: HTMLElement | null;
  readonly empty: HTMLElement | null;
  readonly all: HTMLElement | null;
}

function partsOf(host: BehaviorHost): Parts | null {
  const input = partOf(host, 'input');
  const results = partOf(host, 'results');
  if (!(input instanceof HTMLInputElement) || results === null) return null;
  const template = host.root.querySelector<HTMLTemplateElement>('template[data-part="item"]');
  const first = template?.content.firstElementChild;
  return {
    input,
    results,
    row: first instanceof HTMLElement ? first : null,
    empty: partOf(host, 'empty'),
    all: partOf(host, 'all'),
  };
}

// Строка подсказки — копия первого элемента шаблона с частями link, image, title, price, compare.
function rowOf(parts: Parts, item: SearchItem): HTMLElement {
  const row = (parts.row ?? document.createElement('li')).cloneNode(true);
  if (!(row instanceof HTMLElement)) return document.createElement('li');
  const link = row.querySelector<HTMLElement>('[data-part="link"]');
  if (link !== null) setAttr(link, 'a', 'href', item.url);
  const image = row.querySelector<HTMLElement>('[data-part="image"]');
  if (image !== null) {
    if (item.image === null) image.hidden = true;
    else {
      setAttr(image, 'img', 'src', item.image);
      setAttr(image, 'img', 'alt', item.title);
    }
  }
  const title = row.querySelector<HTMLElement>('[data-part="title"]');
  if (title !== null) title.textContent = item.title;
  const price = row.querySelector<HTMLElement>('[data-part="price"]');
  if (price !== null) price.textContent = item.price.text;
  const compare = row.querySelector<HTMLElement>('[data-part="compare"]');
  if (compare !== null) {
    if (item.compareAtPrice === null) compare.hidden = true;
    else compare.textContent = item.compareAtPrice.text;
  }
  return row;
}

// «Все результаты» — адрес каталога с запросом; нет action — ссылки нет.
function allHrefOf(form: HTMLFormElement | null, text: string): string | null {
  if (form === null) return null;
  const action = form.getAttribute('action');
  if (action === null) return null;
  const url = new URL(action, location.href);
  url.search = new URLSearchParams({ q: text }).toString();
  return `${url.pathname}${url.search}`;
}

function showAnswer(parts: Parts, form: HTMLFormElement | null, text: string, items: readonly SearchItem[]): void {
  const rows = items.map((item) => rowOf(parts, item));
  parts.results.replaceChildren(...rows);
  if (parts.empty !== null) parts.empty.hidden = rows.length > 0;
  const all = parts.all;
  if (all === null) return;
  const href = rows.length > 0 ? allHrefOf(form, text) : null;
  all.hidden = href === null;
  if (href !== null) setAttr(all, 'a', 'href', href);
}

// Пустое поле после обрезки: строки убраны, «Ничего не нашли» и «Все результаты» спрятаны, запроса нет.
function clearOf(parts: Parts): void {
  parts.results.replaceChildren();
  if (parts.empty !== null) parts.empty.hidden = true;
  if (parts.all !== null) parts.all.hidden = true;
}

function listenInput(parts: Parts, module: SearchModule, host: BehaviorHost): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  parts.input.addEventListener(
    'input',
    () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const text = parts.input.value.trim();
        if (text === '') return clearOf(parts);
        const limit = Number(host.params.limit);
        void module.query(text, { limit, quiet: true }).then((answer) => {
          if (answer.ok) showAnswer(parts, parts.input.closest('form'), text, answer.data.items);
        });
      }, SEARCH_PAUSE_MS);
    },
    { signal: host.signal },
  );
}

function listenSubmit(parts: Parts, host: BehaviorHost): void {
  const form = parts.input.closest('form');
  if (form === null) return;
  form.addEventListener(
    'submit',
    (event) => {
      const text = parts.input.value.trim();
      if (text === '' || form.getAttribute('action') === null) event.preventDefault();
      if (text !== '') host.core?.emit('merfy:search:submit', { query: text });
    },
    { signal: host.signal },
  );
}

// Открытие панели (Р11б-20): окно вокруг панели открывает событие — data-open-on="search-open" у dialog; здесь —
// курсор в поле.
function listenOpen(parts: Parts, host: BehaviorHost): void {
  document.addEventListener('merfy:search:open', () => setTimeout(() => parts.input.focus(), 0), {
    signal: host.signal,
  });
}

export const search: Behavior<'search'> = {
  name: 'search',
  attach(host: BehaviorHost) {
    let module: SearchModule;
    try {
      if (host.core === undefined) throw new Error('нет ядра');
      module = host.core.part('search');
    } catch {
      console.error(NO_MODULE_TEXT);
      return {};
    }
    const parts = partsOf(host);
    if (parts === null) return {};
    listenInput(parts, module, host);
    listenSubmit(parts, host);
    listenOpen(parts, host);
    return {};
  },
};
