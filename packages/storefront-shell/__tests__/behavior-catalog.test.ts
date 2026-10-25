import { afterEach, describe, expect, it, vi } from 'vitest';
import { addressOf, catalog, previewListOf } from '../src/core/behaviors/catalog-list';
import { behaviors } from '../src/core/behaviors/part';
import { PREVIEW_LIST_EVENT } from '../src/core/preview-protocol';
import { start, type StartedCore } from '../src/core/start';
import { configTag } from './core-support';
import { field, settle } from './sdk-support';

// Поведение catalog (блок 11 «Секций и SDK», часть 11б-2; design.md 11.3, 11.4): «Показать ещё», «Показать
// предыдущие», прокрутка, номера; фильтры без перезагрузки; превью — событием merfy:preview:list. Ядро настоящее: новая
// <merfy-section> запускается заново, поведение подключается к ней само.
const ID = 'cat-1';
const FORM =
  '<form data-part="filters" method="get" action="/catalog"><select name="sort"><option value="">Новые</option><option value="price_desc">Цена по убыванию</option><option value="title_asc">По названию</option></select><label><input type="checkbox" name="collection" value="sharfy"> Шарфы</label><input type="hidden" name="q" value=""></form>';

interface View {
  readonly page: number;
  readonly rows: readonly number[];
  readonly next?: string;
  readonly prev?: string;
  readonly paging?: string;
  readonly form?: string;
}

function sectionHtml(view: View): string {
  const rows = view.rows.map((n) => `<li>Товар ${n}</li>`).join('');
  const prev = view.prev === undefined ? '' : `<a data-part="prev" href="${view.prev}">Показать предыдущие</a>`;
  const next = view.next === undefined ? '' : `<a data-part="next" href="${view.next}">Показать ещё</a>`;
  return `<merfy-section data-section="shop:catalog" data-section-id="${ID}"><div data-behavior="catalog" data-paging="${view.paging ?? 'more'}">${view.form ?? ''}${prev}<ul data-part="list" data-page="${view.page}">${rows}</ul><p>Показано <span data-part="count">${view.rows.length}</span> из 5</p>${next}<nav data-part="pages"><a href="/catalog/page/2">2</a></nav><p data-part="status" aria-live="polite"></p></div></merfy-section>`;
}

const pageHtml = (view: View, list: string | null = null): string =>
  `<!doctype html><html><head>${list === null ? '' : `<meta name="merfy-list" content="${list}">`}</head><body><main>${sectionHtml(view)}</main></body></html>`;

type Answer = string | 'network' | 'hang';
interface Asked {
  readonly path: string;
  readonly signal: AbortSignal | null;
}

function server(answers: Readonly<Record<string, Answer>>): Asked[] {
  const asked: Asked[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit): Promise<Response> => {
      const url = new URL(input);
      const path = `${url.pathname}${url.search}`;
      asked.push({ path, signal: init?.signal ?? null });
      const answer = answers[path];
      if (answer === 'network') return Promise.reject(new TypeError('Failed to fetch'));
      if (answer === 'hang')
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('отменено', 'AbortError')));
        });
      const status = answer === undefined ? 404 : 200;
      return Promise.resolve(new Response(answer ?? 'нет', { status, headers: { 'content-type': 'text/html' } }));
    }),
  );
  return asked;
}

const stops: (() => void)[] = [];
function heard(name: string): unknown[] {
  const list: unknown[] = [];
  const listener = (event: Event): void => void list.push(event instanceof CustomEvent ? event.detail : null);
  document.addEventListener(name, listener);
  stops.push(() => document.removeEventListener(name, listener));
  return list;
}

let started: StartedCore | null = null;
function open(view: View, mode: 'live' | 'preview' = 'live', path = '/catalog'): void {
  window.history.replaceState(null, '', path);
  document.head.innerHTML = configTag(mode);
  document.body.innerHTML = `<main>${sectionHtml(view)}</main>`;
  started = start({ parts: [behaviors({ list: [catalog] })], sections: [] });
}

const part = (name: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-section-id="${ID}"] [data-part="${name}"]`);
const rows = (): string[] =>
  [...document.querySelectorAll(`[data-section-id="${ID}"] [data-part="list"] li`)].map((row) => row.textContent ?? '');

function choose(sort: string, collection: boolean): void {
  const form = part('filters');
  const select = form?.querySelector('select');
  const box = form?.querySelector('input[type="checkbox"]');
  if (!(select instanceof HTMLSelectElement) || !(box instanceof HTMLInputElement)) throw new Error('нет полей формы');
  select.value = sort;
  box.checked = collection;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

afterEach(() => {
  started?.stop();
  started = null;
  stops.splice(0).forEach((stop) => stop());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

describe('поведение catalog: листание', () => {
  it('«Показать ещё»: строки — в конец, число, ссылка, адрес, событие; новая секция листает дальше', async () => {
    const asked = server({
      '/catalog/page/2': pageHtml({ page: 2, rows: [3, 4], next: '/catalog/page/3', prev: '/catalog' }),
      '/catalog/page/3': pageHtml({ page: 3, rows: [5], prev: '/catalog/page/2' }),
    });
    const pages = heard('merfy:catalog:page');
    open({ page: 1, rows: [1, 2], next: '/catalog/page/2' });
    expect(part('pages')?.hidden).toBe(true);
    part('next')?.click();
    expect(part('list')?.getAttribute('aria-busy')).toBe('true');
    await settle();
    expect(rows()).toEqual(['Товар 1', 'Товар 2', 'Товар 3', 'Товар 4']);
    expect(part('count')?.textContent).toBe('4');
    expect(part('next')?.getAttribute('href')).toBe('/catalog/page/3');
    expect(part('prev')).toBeNull();
    expect(part('status')?.textContent).toBe('Загружено ещё 2');
    expect(window.location.pathname).toBe('/catalog/page/2');
    expect(pages).toEqual([{ page: 2 }]);
    part('next')?.click();
    await settle();
    expect(rows()).toHaveLength(5);
    expect(part('next')).toBeNull();
    expect(asked.map((one) => one.path)).toEqual(['/catalog/page/2', '/catalog/page/3']);
  });

  it('«Показать предыдущие» на странице 2: строки — в начало, «Показать ещё» прежняя', async () => {
    server({ '/catalog': pageHtml({ page: 1, rows: [1, 2], next: '/catalog/page/2' }) });
    open({ page: 2, rows: [3, 4], next: '/catalog/page/3', prev: '/catalog' }, 'live', '/catalog/page/2');
    part('prev')?.click();
    await settle();
    expect(rows()).toEqual(['Товар 1', 'Товар 2', 'Товар 3', 'Товар 4']);
    expect(part('next')?.getAttribute('href')).toBe('/catalog/page/3');
    expect(part('prev')).toBeNull();
    expect(window.location.pathname).toBe('/catalog');
  });

  it('«Номера страниц»: ссылки обычные, запросов нет, номера видны', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // jsdom: переход по ссылке не реализован
    const asked = server({});
    open({ page: 1, rows: [1, 2], next: '/catalog/page/2', paging: 'pages' });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    expect(part('next')?.dispatchEvent(click)).toBe(true);
    expect(part('pages')?.hidden).toBe(false);
    expect(asked).toHaveLength(0);
  });

  it('«Бесконечная прокрутка»: ссылка на экране — запрос, вне экрана — нет', async () => {
    const seen: ((entries: readonly { isIntersecting: boolean }[]) => void)[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: (entries: readonly { isIntersecting: boolean }[]) => void) {
          seen.push(callback);
        }
        observe = (): void => undefined;
        unobserve = (): void => undefined;
        disconnect = (): void => undefined;
      },
    );
    const asked = server({ '/catalog/page/2': pageHtml({ page: 2, rows: [3, 4] }) });
    open({ page: 1, rows: [1, 2], next: '/catalog/page/2', paging: 'scroll' });
    seen[0]?.([{ isIntersecting: false }]);
    expect(asked).toHaveLength(0);
    seen[0]?.([{ isIntersecting: true }]);
    await settle();
    expect(rows()).toHaveLength(4);
  });

  it('во время запроса второй «Показать ещё» запрос не запускает', () => {
    const asked = server({ '/catalog/page/2': 'hang' });
    open({ page: 1, rows: [1, 2], next: '/catalog/page/2' });
    part('next')?.click();
    part('next')?.click();
    expect(asked).toHaveLength(1);
  });
});

describe('поведение catalog: фильтры', () => {
  it('без кнопки «Показать» — по изменению поля; список заменён; в адресе — только collection', async () => {
    const fresh = { page: 1, rows: [4, 2], next: '/catalog?sort=price_desc&collection=sharfy&page=2', form: FORM };
    const asked = server({ '/catalog?sort=price_desc&collection=sharfy': pageHtml(fresh, 'collection=sharfy&sort=price_desc') });
    open({ page: 1, rows: [1, 2], next: '/catalog/page/2', form: FORM });
    choose('price_desc', true);
    await settle();
    expect(asked.map((one) => one.path)).toEqual(['/catalog?sort=price_desc&collection=sharfy']);
    expect(rows()).toEqual(['Товар 4', 'Товар 2']);
    expect(part('status')?.textContent).toBe('Показано 2');
    expect(`${window.location.pathname}${window.location.search}`).toBe('/catalog?collection=sharfy');
  });

  it('ответ без merfy-list — уведомление server, секция прежняя; сбой сети — network, ссылка остаётся', async () => {
    server({ '/catalog?sort=price_desc': pageHtml({ page: 1, rows: [9] }), '/catalog/page/2': 'network' });
    const notices = heard('merfy:notice:show');
    open({ page: 1, rows: [1, 2], next: '/catalog/page/2', form: FORM });
    const before = document.querySelector('merfy-section');
    choose('price_desc', false);
    await settle();
    expect(rows()).toEqual(['Товар 1', 'Товар 2']);
    expect(document.querySelector('merfy-section')).toBe(before);
    part('next')?.click();
    await settle();
    expect(part('next')?.getAttribute('href')).toBe('/catalog/page/2');
    expect(part('list')?.hasAttribute('aria-busy')).toBe(false);
    expect(notices).toMatchObject([
      { level: 'error', code: 'server' },
      { level: 'error', code: 'network' },
    ]);
  });

  it('новый выбор отменяет прошлый запрос', async () => {
    const asked = server({
      '/catalog?sort=price_desc': 'hang',
      '/catalog?sort=title_asc': pageHtml({ page: 1, rows: [7] }, 'sort=title_asc'),
    });
    open({ page: 1, rows: [1, 2], form: FORM });
    choose('price_desc', false);
    choose('title_asc', false);
    await settle();
    expect(asked[0]?.signal?.aborted).toBe(true);
    expect(rows()).toEqual(['Товар 7']);
  });
});

describe('поведение catalog в превью', () => {
  it('событие merfy:preview:list с параметрами, HTML — через reply; никто не ответил — список прежний', async () => {
    const asked = server({});
    const lists: string[] = [];
    const answer = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const detail: unknown = event.detail;
      const list = field(detail, 'list');
      const reply = field(detail, 'reply');
      if (typeof list !== 'string' || typeof reply !== 'function') return;
      event.preventDefault();
      lists.push(list);
      Reflect.apply(reply, null, [sectionHtml({ page: 2, rows: [3, 4], form: FORM })]);
    };
    document.addEventListener(PREVIEW_LIST_EVENT, answer);
    open({ page: 1, rows: [1, 2], next: '/catalog/page/2', form: FORM }, 'preview');
    part('next')?.click();
    await settle();
    expect(lists).toEqual(['page=2']);
    expect(rows()).toEqual(['Товар 1', 'Товар 2', 'Товар 3', 'Товар 4']);
    expect(window.location.pathname).toBe('/catalog');
    document.removeEventListener(PREVIEW_LIST_EVENT, answer);
    choose('price_desc', true);
    await settle();
    expect(rows()).toHaveLength(4);
    expect(part('list')?.hasAttribute('aria-busy')).toBe(false);
    expect(asked).toHaveLength(0);
  });
});

describe('адрес и параметры превью', () => {
  const at = (path: string): URL => new URL(path, 'https://shop.example');

  it('addressOf: страница — её адрес, пока выбраны только q и collection; фильтры — q и collection без номера', () => {
    expect(addressOf(at('/catalog/page/2'), 'page')).toBe('/catalog/page/2');
    expect(addressOf(at('/catalog?q=%D0%BD&page=2'), 'page')).toBe('/catalog?q=%D0%BD&page=2');
    expect(addressOf(at('/catalog?sort=price_desc&page=2'), 'page')).toBeNull();
    expect(addressOf(at('/catalog?sort=price_desc&collection=a&collection=b'), 'filters')).toBe('/catalog?collection=a&collection=b');
    expect(addressOf(at('/catalog?availability=in_stock'), 'filters')).toBe('/catalog');
  });

  it('previewListOf: имена по алфавиту, номер из /page/N, первая страница не пишется', () => {
    expect(previewListOf(at('/catalog/page/3'))).toBe('page=3');
    expect(previewListOf(at('/catalog?sort=price_desc&availability=in_stock&page=1'))).toBe('availability=in_stock&sort=price_desc');
    expect(previewListOf(at('/catalog?q=%D0%BD%D0%BE%D0%B2%D0%B0&page=2'))).toBe('page=2&q=%D0%BD%D0%BE%D0%B2%D0%B0');
  });
});
