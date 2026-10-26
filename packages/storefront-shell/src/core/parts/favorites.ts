import { messageOf } from '../../report';
import { CUSTOMER_TOKEN_KEY, dropToken, tokenOf } from '../customer-token';
import { type Failure, type Reply, failed, failureOf, reasonOf, reportFailure, reportWarning } from '../failures';
import { requestJson } from '../requests';
import { pageStorage, type KeyValue } from '../storage';
import { storeItemsOf } from '../store-items';
import { type Atom, atom, batch, computed, onMount, readable } from '../stores';
import type {
  ActionOptions,
  CatalogItem,
  CoreHandle,
  FavoriteProducts,
  FavoritesModule,
  FavoritesState,
  Result,
  SdkPart,
} from '../types';

// Избранное (блок 10 «Секций и SDK», часть 10б, Р10б-4…Р10б-9): гостья — FAVORITES_KEY в хранилище страницы, до 200,
// новые сверху; вошедшая — storefront/wishlist шлюза с токеном покупательницы. Карточки отмеченных — $products,
// запросы /store/products?ids=… по PRODUCTS_CHUNK id. Очередь и запись сторов — как у корзины (parts/cart.ts).

export const FAVORITES_KEY = 'merfy:favorites:v1';
export const FAVORITES_LIMIT = 200;
export const PRODUCTS_CHUNK = 100;
export const FAVORITES_LIMIT_TEXT = 'В избранном уже 200 товаров. Уберите что-нибудь, чтобы добавить';
export const MERGED_TEXT = 'В избранном больше 200 товаров — перенесли последние 200';

// Строка списка избранного: товар и момент отметки (мс).
export type FavoriteEntry = { readonly productId: string; readonly addedAt: number };

// Модуль → его состояние: слиянию и выходу (часть 10в) нужен доступ к сторам и хранилищу.
interface FavoritesRuntime {
  readonly core: CoreHandle;
  readonly state: Atom<FavoritesState>;
  readonly products: Atom<FavoriteProducts>;
  readonly page: KeyValue;
  readonly enqueue: <T>(task: () => Promise<T>) => Promise<T>;
  readonly writeStores: (write: () => void) => void;
  readonly cards: Map<string, CatalogItem>;
  readonly requested: Set<string>; // id уже был в запросе: ответа без товара достаточно (Р10б-8)
  readDone: boolean; // список сервера прочитан (вошедшая)
  readQueued: boolean; // чтение по подписке стоит в очереди и ещё не началось
  pumping: boolean; // карточки качают недостающих
}

const RUNTIMES = new WeakMap<FavoritesModule, FavoritesRuntime>();

interface ShopApi {
  readonly url: string;
  readonly storeId: string;
  readonly currency: string;
}

const shopApiOf = (core: CoreHandle): ShopApi | null => {
  const config = core.config;
  if (config === null) return null;
  return { url: config.api.url, storeId: config.shop.id, currency: config.currency };
};

const isEntry = (value: unknown): value is FavoriteEntry => {
  if (typeof value !== 'object' || value === null) return false;
  const productId: unknown = Reflect.get(value, 'productId');
  const addedAt: unknown = Reflect.get(value, 'addedAt');
  return typeof productId === 'string' && productId !== '' && typeof addedAt === 'number';
};

// Записи без повторов, новые сверху: у повтора — поздний addedAt.
function uniqueSorted(entries: readonly FavoriteEntry[]): FavoriteEntry[] {
  const byId = new Map<string, FavoriteEntry>();
  for (const entry of entries) {
    const known = byId.get(entry.productId);
    if (known === undefined || entry.addedAt > known.addedAt) byId.set(entry.productId, entry);
  }
  return [...byId.values()].sort((first, second) => second.addedAt - first.addedAt);
}

// Список гостьи из хранилища страницы; значение не по форме — пустой список (Р10б-4).
function guestEntries(page: KeyValue): FavoriteEntry[] {
  const raw = page.getItem(FAVORITES_KEY);
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const ids: unknown = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'ids') : undefined;
  return Array.isArray(ids) ? uniqueSorted(ids.filter(isEntry)) : [];
}

const writeGuest = (page: KeyValue, entries: readonly FavoriteEntry[]): void => {
  page.setItem(FAVORITES_KEY, JSON.stringify({ ids: entries }));
};

const idsOf = (entries: readonly FavoriteEntry[]): readonly string[] => entries.map((entry) => entry.productId);

// Ответ storefront/wishlist: { success, data: [...] }; не по форме — null.
function serverEntries(reply: Reply): FavoriteEntry[] | null {
  const body = reply.body;
  if (typeof body !== 'object' || body === null || Reflect.get(body, 'success') !== true) return null;
  const data: unknown = Reflect.get(body, 'data');
  return Array.isArray(data) ? uniqueSorted(data.filter(isEntry)) : null;
}

const isOkReply = (reply: Reply): boolean => {
  const body = reply.body;
  return typeof body === 'object' && body !== null && Reflect.get(body, 'success') === true;
};

const limitFailure = (): Failure => ({ code: 'limit', message: FAVORITES_LIMIT_TEXT, notice: FAVORITES_LIMIT_TEXT });

const setIds = (rt: FavoritesRuntime, ids: readonly string[]): void => {
  rt.writeStores(() => rt.state.set({ ready: true, ids }));
};

// Очередь: чтение и отметки по одному, в порядке вызова; ошибка задачи не рвёт цепочку.
function createQueue(): FavoritesRuntime['enqueue'] {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}

// Запись в сторы — одним batch: ошибка подписчика — строкой в консоль (Р9а-11).
function writeStoresOf(): FavoritesRuntime['writeStores'] {
  return (write) => {
    try {
      batch(write);
    } catch (error) {
      console.error(`Подписчик стора избранного: ${messageOf(error)}`);
    }
  };
}

interface ReadOutcome {
  readonly kind: 'list' | 'unauthorized' | 'failed';
  readonly entries: readonly FavoriteEntry[];
}

// Чтение списка сервера с токеном: 401 — токен просрочен, остальное — фоновая ошибка (Р10б-5).
async function readServerList(rt: FavoritesRuntime): Promise<ReadOutcome> {
  const conf = shopApiOf(rt.core);
  const token = tokenOf(rt.page);
  if (conf === null || token === null) return { kind: 'failed', entries: [] };
  const reply = await requestJson(`${conf.url}/storefront/wishlist`, { method: 'GET', token });
  if (reply.status === 401) return { kind: 'unauthorized', entries: [] };
  const entries = serverEntries(reply);
  return entries === null ? { kind: 'failed', entries: [] } : { kind: 'list', entries };
}

// 401 при сохранённом токене: токен удалён, событие merfy:auth:signout, избранное — гостья с пустым списком.
function signOut(rt: FavoritesRuntime): void {
  dropToken(rt.page);
  rt.core.emit('merfy:auth:signout', {});
  setIds(rt, []);
}

async function readList(rt: FavoritesRuntime): Promise<null> {
  const outcome = await readServerList(rt);
  rt.readDone = true;
  if (outcome.kind === 'unauthorized') {
    signOut(rt);
    return null;
  }
  if (outcome.kind === 'list') {
    setIds(rt, idsOf(outcome.entries));
    return null;
  }
  // Фоновая ошибка чтения: список готов, прежние ids (Р10б-8).
  setIds(rt, rt.state.get().ids);
  return null;
}

// Чтение в очереди: подписки и события страницы дают одно чтение, пока поставленное не началось.
function queueRead(rt: FavoritesRuntime): void {
  if (rt.readQueued) return;
  rt.readQueued = true;
  void rt.enqueue(() => {
    rt.readQueued = false;
    return readList(rt);
  });
}

// Другая вкладка (Р10б-9): список гостьи перечитан; смена токена — смена режима. Пока на стор подписаны.
function listenStorage(rt: FavoritesRuntime): () => void {
  const signal = new AbortController();
  const onStorage = (event: StorageEvent): void => {
    if (event.key === FAVORITES_KEY) return void onGuestStorage(rt);
    if (event.key === CUSTOMER_TOKEN_KEY) return void onTokenStorage(rt);
  };
  window.addEventListener('storage', onStorage, { signal: signal.signal });
  return () => signal.abort();
}

function onGuestStorage(rt: FavoritesRuntime): void {
  if (tokenOf(rt.page) !== null) return;
  setIds(rt, idsOf(guestEntries(rt.page)));
}

function onTokenStorage(rt: FavoritesRuntime): void {
  if (tokenOf(rt.page) === null) {
    setIds(rt, []);
    return;
  }
  rt.writeStores(() => rt.state.set({ ready: false, ids: [] }));
  queueRead(rt);
}

// Первая подписка на $favorites: вошедшая — чтение списка сервера; слушатель другой вкладки.
function mountState(rt: FavoritesRuntime, state: Atom<FavoritesState>): void {
  onMount(state, () => {
    if (tokenOf(rt.page) !== null && !rt.readDone) queueRead(rt);
    return listenStorage(rt);
  });
}

// Отметка гостьи: стор, браузер и событие — сразу; запросов нет (Р10б-7).
function guestToggle(rt: FavoritesRuntime, productId: string, options?: ActionOptions): Result<{ readonly added: boolean }> {
  const entries = guestEntries(rt.page);
  const kept = entries.some((entry) => entry.productId === productId);
  const next = kept
    ? entries.filter((entry) => entry.productId !== productId)
    : [{ productId, addedAt: Date.now() }, ...entries];
  if (!kept && entries.length >= FAVORITES_LIMIT) {
    const failure = limitFailure();
    reportFailure(rt.core, failure, options);
    return failed(failure);
  }
  writeGuest(rt.page, next);
  setIds(rt, idsOf(next));
  rt.core.emit(kept ? 'merfy:favorites:remove' : 'merfy:favorites:add', { productId });
  return { ok: true, data: { added: !kept } };
}

async function sendToggle(rt: FavoritesRuntime, remove: boolean, productId: string): Promise<Reply> {
  const conf = shopApiOf(rt.core);
  const token = tokenOf(rt.page);
  if (conf === null || token === null) return { status: 0, body: null };
  return requestJson(`${conf.url}/storefront/wishlist/items`, {
    method: remove ? 'DELETE' : 'POST',
    body: { productId },
    token,
  });
}

// Откат неудачной отметки: снятое возвращается, неудачное добавление убирается.
function rollbackToggle(rt: FavoritesRuntime, productId: string, kept: boolean): void {
  const rest = rt.state.get().ids.filter((id) => id !== productId);
  setIds(rt, kept ? [productId, ...rest] : rest);
}

// Итог отметки вошедшей: событие — после ответа; ошибка — откат и уведомление (Р10б-7).
function finishToggle(
  rt: FavoritesRuntime,
  reply: Reply,
  productId: string,
  kept: boolean,
  options?: ActionOptions,
): Result<{ readonly added: boolean }> {
  if (isOkReply(reply)) {
    rt.core.emit(kept ? 'merfy:favorites:remove' : 'merfy:favorites:add', { productId });
    return { ok: true, data: { added: !kept } };
  }
  rollbackToggle(rt, productId, kept);
  if (reasonOf(reply) === 'unauthorized') {
    signOut(rt);
    const failure = failureOf('unauthorized', 'favorites: токен не принят шлюзом');
    reportFailure(rt.core, failure, options);
    return failed(failure);
  }
  const failure = reply.status === 409 && !kept ? limitFailure() : failureOf(reasonOf(reply), 'favorites: отметка на сервере');
  reportFailure(rt.core, failure, options);
  return failed(failure);
}

// Отметка вошедшей: стор сразу, запрос в очереди (первая ждёт чтения списка сервера), событие — после ответа.
async function signedInToggle(
  rt: FavoritesRuntime,
  productId: string,
  options?: ActionOptions,
): Promise<Result<{ readonly added: boolean }>> {
  const kept = rt.state.get().ids.includes(productId);
  const rest = rt.state.get().ids.filter((id) => id !== productId);
  const next = kept ? rest : [productId, ...rest];
  rt.writeStores(() => rt.state.set({ ready: rt.state.get().ready, ids: next }));
  return rt.enqueue(async () => {
    if (!rt.readDone) await readList(rt);
    // Чтение списка затёрло оптимистичную отметку — вернуть её.
    if (rt.state.get().ids.includes(productId) === kept) {
      rt.writeStores(() => rt.state.set({ ready: true, ids: next }));
    }
    const reply = await sendToggle(rt, kept, productId);
    return finishToggle(rt, reply, productId, kept, options);
  });
}

// Начальное состояние: гостья — список браузера готов; вошедшая — ждёт чтения сервера (Р10б-4).
function initialStateOf(page: KeyValue): FavoritesState {
  if (tokenOf(page) !== null) return { ready: false, ids: [] };
  return { ready: true, ids: idsOf(guestEntries(page)) };
}

const toggleOf =
  (rt: FavoritesRuntime) =>
  async (
    args: { readonly productId: string },
    options?: ActionOptions,
  ): Promise<Result<{ readonly added: boolean }>> => {
    if (args.productId === '') {
      const failure = failureOf('invalid', 'favorites.toggle: productId — непустая строка');
      reportFailure(rt.core, failure, options);
      return failed(failure);
    }
    if (tokenOf(rt.page) !== null) return signedInToggle(rt, args.productId, options);
    return guestToggle(rt, args.productId, options);
  };

// Карточки отмеченных (Р10б-8): читаются при первой подписке; новые отметки — запрос только недостающих; снятая —
// карточка уходит без запроса. Ошибка шлюза — ready: true и прежние карточки, уведомления нет (фон).
// Недостающие карточки: id ещё без карточки и ещё не было в запросе — ответа без товара достаточно.
function missingIdsOf(rt: FavoritesRuntime): readonly string[] {
  return rt.state.get().ids.filter((id) => !rt.cards.has(id) && !rt.requested.has(id));
}

async function fetchChunk(rt: FavoritesRuntime, ids: readonly string[]): Promise<boolean> {
  const conf = shopApiOf(rt.core);
  if (conf === null) return false;
  for (const id of ids) rt.requested.add(id);
  const params = new URLSearchParams({ store_id: conf.storeId, ids: ids.join(',') });
  const reply = await requestJson(`${conf.url}/store/products?${params.toString()}`, { method: 'GET' });
  const body: unknown = reply.body;
  const list: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'products') : undefined;
  const items = reply.status >= 200 && reply.status < 300 ? storeItemsOf(list, conf.currency) : null;
  if (items === null) return false;
  for (const item of items) rt.cards.set(item.id, item);
  return true;
}

function publishCards(rt: FavoritesRuntime, ready: boolean): void {
  const products = rt.state.get().ids.flatMap((id) => {
    const card = rt.cards.get(id);
    return card === undefined ? [] : [card];
  });
  rt.writeStores(() => rt.products.set({ ready, products }));
}

// Один шаг прокачки: пусто — готово; иначе запрос порции и публикация. false — качать больше нечего.
async function pumpStep(rt: FavoritesRuntime): Promise<boolean> {
  const missing = missingIdsOf(rt);
  if (missing.length === 0) {
    publishCards(rt, true);
    return false;
  }
  const fetched = await fetchChunk(rt, missing.slice(0, PRODUCTS_CHUNK));
  publishCards(rt, true);
  return fetched;
}

async function pumpCards(rt: FavoritesRuntime): Promise<void> {
  if (rt.pumping) return;
  rt.pumping = true;
  try {
    while (await pumpStep(rt));
  } finally {
    rt.pumping = false;
  }
}

// Первая подписка на $products: карточки качаются, изменения списка их поддерживают.
function mountProducts(rt: FavoritesRuntime, products: Atom<FavoriteProducts>): void {
  onMount(products, () => {
    const stop = rt.state.listen(() => void pumpCards(rt));
    // Первая прокачка — микрозадачей: секция подписалась во время старта страницы, ответы шлюза ещё настраиваются.
    void Promise.resolve().then(() => pumpCards(rt));
    return stop;
  });
}

// Слияние при входе (Р10б-6): сервер и браузер без повторов, первые FAVORITES_LIMIT → PUT; успех — список браузера
// стёрт, стор — объединённый; ошибка — список браузера остаётся, уведомление по коду.
function mergeOf(guest: readonly FavoriteEntry[], server: readonly FavoriteEntry[]): readonly FavoriteEntry[] {
  return uniqueSorted([...guest, ...server]).slice(0, FAVORITES_LIMIT);
}

// Ошибка чтения списка при слиянии: 401 — выход, остальное — server; список браузера остаётся.
function mergeReadFailure(rt: FavoritesRuntime, kind: 'unauthorized' | 'failed'): Result<null> {
  if (kind === 'unauthorized') {
    signOut(rt);
    const failure = failureOf('unauthorized', 'favorites: токен не принят шлюзом');
    reportFailure(rt.core, failure);
    return failed(failure);
  }
  const failure = failureOf('server', 'favorites: список сервера не прочитан');
  reportFailure(rt.core, failure);
  return failed(failure);
}

async function mergeIntoServer(rt: FavoritesRuntime): Promise<Result<null>> {
  const conf = shopApiOf(rt.core);
  const token = tokenOf(rt.page);
  if (conf === null || token === null) {
    const failure = failureOf('server', 'favorites: конфиг витрины не прочитан или нет токена');
    reportFailure(rt.core, failure);
    return failed(failure);
  }
  const outcome = await readServerList(rt);
  if (outcome.kind !== 'list') return mergeReadFailure(rt, outcome.kind);
  const guest = guestEntries(rt.page);
  const together = uniqueSorted([...guest, ...outcome.entries]);
  const items = mergeOf(guest, outcome.entries);
  const reply = await requestJson(`${conf.url}/storefront/wishlist`, {
    method: 'PUT',
    body: { items },
    token,
  });
  if (!isOkReply(reply)) {
    const failure = failureOf(reasonOf(reply), 'favorites: PUT storefront/wishlist');
    reportFailure(rt.core, failure);
    return failed(failure);
  }
  rt.page.removeItem(FAVORITES_KEY);
  rt.readDone = true;
  setIds(rt, idsOf(items));
  if (together.length > FAVORITES_LIMIT) reportWarning(rt.core, MERGED_TEXT);
  return { ok: true, data: null };
}

export function mergeFavorites(api: FavoritesModule): Promise<Result<null>> {
  const rt = RUNTIMES.get(api);
  if (rt === undefined) return Promise.resolve(failed(failureOf('server', 'favorites: модуль не найден')));
  return mergeIntoServer(rt);
}

// Выход (Р10б-6): стор пустой, список браузера стёрт.
export function clearFavorites(api: FavoritesModule): void {
  const rt = RUNTIMES.get(api);
  if (rt === undefined) return;
  rt.page.removeItem(FAVORITES_KEY);
  setIds(rt, []);
}

export const favorites: SdkPart<'favorites', FavoritesModule> = {
  name: 'favorites',
  create: (core: CoreHandle): FavoritesModule => {
    const page = pageStorage(window, core.mode);
    const state = atom<FavoritesState>(initialStateOf(page));
    const products = atom<FavoriteProducts>({ ready: false, products: [] });
    const count = computed(state, (value) => value.ids.length);
    const rt: FavoritesRuntime = {
      core,
      state,
      products,
      page,
      cards: new Map(),
      requested: new Set(),
      readDone: false,
      readQueued: false,
      pumping: false,
      enqueue: createQueue(),
      writeStores: writeStoresOf(),
    };
    mountState(rt, state);
    mountProducts(rt, products);
    const module: FavoritesModule = {
      $favorites: readable(state),
      $count: readable(count),
      $products: readable(products),
      toggle: toggleOf(rt),
    };
    RUNTIMES.set(module, rt);
    return module;
  },
  markup: {
    toggle: {
      params: ['product-id'],
      call: (api: FavoritesModule, values): Promise<Result<unknown>> =>
        api.toggle({ productId: values['product-id'] ?? '' }),
    },
  },
};
