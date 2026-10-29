import { type Failure, failed, failureOf, reasonOf, reportFailure } from '../failures';
import { requestJson } from '../requests';
import { roleWorks } from '../roles';
import { storeItemOf } from '../store-items';
import type { ActionOptions, CoreHandle, Result, SdkPart, SearchItem, SearchModule } from '../types';

// Модуль «Поиск» (блок 11 «Секций и SDK», часть 11б; design.md 11.5, Р11б-6): подсказки — тот же запрос шлюза, что у
// пяти тем. Пустой запрос — без запроса; кеш на странице; новый вызов отменяет прошлый: ответ старого обещания не
// выполняется, но в кеш ложится. search.open (Р11б-7) — панель секции «Поиск» или переход на каталог.

export const SEARCH_LIMIT = 8; // как у product-service по умолчанию
export const SEARCH_Q_MAX = 500;
export const SEARCH_CACHE_SIZE = 40;
export const CATALOG_PATH = '/catalog';
// Переход на каталог — через этот объект: в jsdom window.location.assign подменить нельзя, тест подменяет go.
export const searchNavigation = { go: (path: string): void => window.location.assign(path) };

const LIMIT_MAX = 50;
type SearchAnswer = Result<{ readonly items: readonly SearchItem[]; readonly hasMore: boolean }>;
type QueryOptions = { readonly limit?: number } & ActionOptions;

// Ответ шлюза → { items, hasMore }; не по форме — null.
function answerOf(reply: { readonly status: number; readonly body: unknown }, currency: string): SearchAnswer | null {
  const body = reply.body;
  if (reply.status < 200 || reply.status > 299 || typeof body !== 'object' || body === null) return null;
  const products: unknown = Reflect.get(body, 'products');
  const hasMore: unknown = Reflect.get(body, 'hasMore');
  if (!Array.isArray(products) || typeof hasMore !== 'boolean') return null;
  const items = products.flatMap((raw): readonly SearchItem[] => {
    const item = storeItemOf(raw, currency);
    // /store/products/search не отдаёт hasVariants: строка подсказки — только поля SearchItem.
    return item === null
      ? []
      : [
          {
            id: item.id,
            title: item.title,
            url: item.url,
            image: item.image,
            price: item.price,
            compareAtPrice: item.compareAtPrice,
            available: item.available,
          },
        ];
  });
  return { ok: true, data: { items, hasMore } };
}

const fail = (core: CoreHandle, failure: Failure, options?: ActionOptions): SearchAnswer => {
  reportFailure(core, failure, options);
  return failed(failure);
};

// Память одного модуля: кеш ответов и номер последнего вызова.
interface SearchState {
  readonly cache: Map<string, SearchAnswer>;
  readonly calls: { number: number };
}

function remember(state: SearchState, key: string, answer: SearchAnswer): void {
  state.cache.set(key, answer);
  const oldest = state.cache.keys().next();
  if (state.cache.size > SEARCH_CACHE_SIZE && oldest.done !== true) state.cache.delete(oldest.value);
}

// Запрос шлюза: ответ всегда ложится в кеш; обещание выполняется, только если вызова новее не было.
function ask(
  core: CoreHandle,
  state: SearchState,
  config: NonNullable<CoreHandle['config']>,
  request: { readonly text: string; readonly limit: number },
  options?: ActionOptions,
): Promise<SearchAnswer> {
  const { text, limit } = request;
  const params = new URLSearchParams({ store_id: config.shop.id, q: text, limit: String(limit) });
  const mine = (state.calls.number += 1);
  return new Promise((resolve) => {
    void requestJson(`${config.api.url}/store/products/search?${params}`, { method: 'GET' }).then((reply) => {
      const answer = answerOf(reply, config.currency);
      const done =
        answer ?? fail(core, failureOf(reasonOf(reply), 'search.query: шлюз поиска ответил не по форме', reply), options);
      remember(state, `${text}|${limit}`, done);
      if (mine === state.calls.number) resolve(done);
    });
  });
}

function query(core: CoreHandle, state: SearchState, q: string, options?: QueryOptions): Promise<SearchAnswer> {
  const text = q.trim();
  const limit = options?.limit ?? SEARCH_LIMIT;
  if (text === '') return Promise.resolve({ ok: true, data: { items: [], hasMore: false } });
  if (text.length > SEARCH_Q_MAX || !Number.isInteger(limit) || limit < 1 || limit > LIMIT_MAX) {
    return Promise.resolve(
      fail(core, failureOf('invalid', 'search.query: запрос до 500 знаков, лимит — целое от 1 до 50'), options),
    );
  }
  const config = core.config;
  if (config === null) {
    return Promise.resolve(fail(core, failureOf('server', 'search.query: конфиг витрины не прочитан'), options));
  }
  const cached = state.cache.get(`${text}|${limit}`);
  return cached !== undefined ? Promise.resolve(cached) : ask(core, state, config, { text, limit }, options);
}

function open(core: CoreHandle): Promise<Result<{ readonly panel: boolean }>> {
  // Панель поиска — секция с ролью search (блок 12, 12.4, случай 3); её нет или её скрипт упал — переход на каталог.
  if (roleWorks(document, 'search')) {
    core.emit('merfy:search:open', {});
    return Promise.resolve({ ok: true, data: { panel: true } });
  }
  if (core.mode === 'live') searchNavigation.go(CATALOG_PATH);
  return Promise.resolve({ ok: true, data: { panel: false } });
}

export const search: SdkPart<'search', SearchModule> = {
  name: 'search',
  create: (core: CoreHandle): SearchModule => {
    const state: SearchState = { cache: new Map(), calls: { number: 0 } };
    return { query: (q, options) => query(core, state, q, options), open: () => open(core) };
  },
  markup: {
    open: {
      params: [],
      call: (api): Promise<Result<unknown>> => api.open(),
    },
  },
};
