import { afterEach, describe, expect, it, vi } from 'vitest';
import { behaviors } from '../src/core/behaviors/part';
import { search as searchBehavior } from '../src/core/behaviors/search';
import { search } from '../src/core/parts/search';
import { start, type StartedCore } from '../src/core/start';
import { configTag } from './core-support';
import { settle } from './sdk-support';

// Поведение search (блок 11 «Секций и SDK», часть 11б-2; design.md 11.5): пауза 250 мс после ввода, строки по
// <template data-part="item">, «Ничего не нашли», «Все результаты», отправка, открытие панели по merfy:search:open.
// Модуль «Поиск» — настоящий, шлюз — заглушка fetch.
const HIT = {
  id: 'p-nova',
  title: 'Шарф «Нова»',
  handle: 'sharf-nova',
  images: ['https://s3.merfy.ru/p/nova.jpg'],
  basePrice: 1900,
  compareAtPrice: null,
  hasVariants: false,
  quantity: 3,
  allowBackorder: false,
};
const ITEM =
  '<template data-part="item"><li><a data-part="link"><img data-part="image" alt=""><span data-part="title"></span><span data-part="price"></span><s data-part="compare"></s></a></li></template>';
const panel = (action: string | null): string =>
  `<div data-behavior="search" data-limit="5"><form method="get"${action === null ? '' : ` action="${action}"`}><input data-part="input" type="search" name="q"></form><ul data-part="results"></ul>${ITEM}<p data-part="empty" hidden>Ничего не нашли</p><a data-part="all" hidden>Все результаты</a></div>`;

let started: StartedCore | null = null;
let queries: URL[] = [];

function open(html: string, withModule = true): void {
  document.head.innerHTML = configTag('live');
  document.body.innerHTML = `<merfy-section data-section="shop:search" data-section-id="search-1">${html}</merfy-section>`;
  queries = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string): Promise<Response> => {
      const url = new URL(input);
      queries.push(url);
      const products = url.searchParams.get('q') === 'нова' ? [HIT] : [];
      return Promise.resolve(new Response(JSON.stringify({ products, hasMore: false }), { status: 200 }));
    }),
  );
  const list = behaviors({ list: [searchBehavior] });
  started = start({ parts: withModule ? [search, list] : [list], sections: [] });
}

function el<T extends Element>(selector: string, type: new () => T): T {
  const node = document.querySelector(selector);
  if (!(node instanceof type)) throw new Error(`нет ${selector}`);
  return node;
}

function type(text: string): void {
  const input = el('[data-part="input"]', HTMLInputElement);
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  started?.stop();
  started = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('поведение search', () => {
  it('пауза 250 мс: один запрос на последний текст; строка — ссылка, фото, название, цена; «Все результаты»', async () => {
    open(panel('/catalog'));
    type('н');
    type('но');
    type('нова');
    await wait(100);
    expect(queries).toHaveLength(0);
    await wait(250);
    await settle();
    expect(queries.map((url) => [url.searchParams.get('q'), url.searchParams.get('limit')])).toEqual([['нова', '5']]);
    expect(el('[data-part="results"] [data-part="link"]', HTMLAnchorElement).getAttribute('href')).toBe('/product/sharf-nova');
    expect(el('[data-part="results"] [data-part="image"]', HTMLImageElement).getAttribute('src')).toBe('https://s3.merfy.ru/p/nova.jpg');
    expect(el('[data-part="results"] [data-part="title"]', HTMLElement).textContent).toBe('Шарф «Нова»');
    expect(el('[data-part="results"] [data-part="price"]', HTMLElement).textContent).toBe(`${(1900).toLocaleString('ru-RU')} ₽`);
    expect(el('[data-part="results"] [data-part="compare"]', HTMLElement).hidden).toBe(true);
    const all = el('[data-part="all"]', HTMLAnchorElement);
    expect([all.hidden, all.getAttribute('href')]).toEqual([false, '/catalog?q=%D0%BD%D0%BE%D0%B2%D0%B0']);
  });

  it('ничего не нашли — «Ничего не нашли» без «Все результаты»; пустое поле — строки убраны без запроса', async () => {
    open(panel('/catalog'));
    type('плед');
    await wait(300);
    await settle();
    expect(el('[data-part="empty"]', HTMLElement).hidden).toBe(false);
    expect(el('[data-part="all"]', HTMLElement).hidden).toBe(true);
    type('  ');
    await wait(300);
    await settle();
    expect(queries).toHaveLength(1);
    expect(el('[data-part="empty"]', HTMLElement).hidden).toBe(true);
    expect(document.querySelectorAll('[data-part="results"] li')).toHaveLength(0);
  });

  it('отправка: merfy:search:submit с запросом; без action и с пустым полем форма не уходит', () => {
    open(panel(null));
    const submitted: unknown[] = [];
    const listen = (event: Event): void => void submitted.push(event instanceof CustomEvent ? event.detail : null);
    document.addEventListener('merfy:search:submit', listen);
    const form = el('form', HTMLFormElement);
    el('[data-part="input"]', HTMLInputElement).value = ' шарф ';
    const sent = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(sent);
    el('[data-part="input"]', HTMLInputElement).value = '';
    const empty = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(empty);
    document.removeEventListener('merfy:search:submit', listen);
    expect([sent.defaultPrevented, empty.defaultPrevented, submitted]).toEqual([true, true, [{ query: 'шарф' }]]);
  });

  it('с каталогом форма уходит обычным GET', () => {
    open(panel('/catalog'));
    el('[data-part="input"]', HTMLInputElement).value = 'шарф';
    const sent = new Event('submit', { bubbles: true, cancelable: true });
    el('form', HTMLFormElement).dispatchEvent(sent);
    expect(sent.defaultPrevented).toBe(false);
  });

  it('merfy:search:open — нажимает «open» окна вокруг панели и ставит курсор в поле', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // кода dialog в этом тесте нет
    open(`<div data-behavior="dialog"><button type="button" data-part="open" hidden>Поиск</button>${panel('/catalog')}</div>`);
    let opened = 0;
    el('[data-part="open"]', HTMLButtonElement).addEventListener('click', () => {
      opened += 1;
    });
    document.dispatchEvent(new CustomEvent('merfy:search:open', { detail: {} }));
    await settle();
    expect(opened).toBe(1);
    expect(document.activeElement).toBe(el('[data-part="input"]', HTMLInputElement));
  });

  it('нет модуля «Поиск» на странице — одна строка в консоль', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    open(panel('/catalog'), false);
    expect(error.mock.calls.map((call) => String(call[0])).filter((text) => text.includes('«Поиск»'))).toHaveLength(1);
  });
});
