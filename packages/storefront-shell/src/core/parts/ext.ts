import type { StorefrontConfig } from '@merfy/storefront-config';
import { ShellError } from '../../errors';
import { messageOf } from '../../report';
import { tokenOf } from '../customer-token';
import { EXT_PART_NAME, registerExtModules } from '../ext-registry';
import { failureOf, failed, reasonOf, reportFailure, type Reply } from '../failures';
import { requestJson, type JsonRequest } from '../requests';
import { pageStorage, type KeyValue } from '../storage';
import { atom, batch, onMount, registerFacade, type Atom } from '../stores';
import type {
  ActionOptions,
  CoreHandle,
  ExtMethod,
  ExtModule,
  ExtStore,
  ExtValue,
  Json,
  MarkupAction,
  ReadableStore,
  Result,
  SdkPart,
} from '../types';

// Часть SDK ext (блок 9, часть 9в): модули расширений из конфига страницы (config.extensions). API части для ядра —
// пустой замороженный объект, зарегистрированный registerExtModules; секциям — только ctx.ext.<id>. Имена сторов и
// методов — из манифестов расширений, ядро их не знает (Р9в-10…Р9в-14).

export const EXT_PRODUCT_BATCH = 100;
const PRODUCT_ID_MAX = 100;

type Extensions = NonNullable<StorefrontConfig['extensions']>;
type ExtensionEntry = Extensions[string];
type StoreSpec = ExtensionEntry['stores'][string];
type MethodSpec = ExtensionEntry['methods'][string];

interface Flight {
  enqueue(work: () => Promise<void>): void;
  sync(): Promise<void>;
}

interface PlainStore {
  readonly spec: StoreSpec;
  readonly atom: Atom<ExtValue>;
  readonly queue: Flight;
}

interface ProductStore {
  readonly spec: StoreSpec;
  readonly atoms: Map<string, Atom<ExtValue>>;
  readonly facades: Map<string, ReadableStore<ExtValue>>;
  readonly queue: Flight;
  readonly pending: Set<string>;
  scheduled: boolean;
  mounted: number;
  stopListeners: (() => void) | null;
}

interface ExtensionState {
  readonly core: CoreHandle;
  readonly config: StorefrontConfig;
  readonly entry: ExtensionEntry;
  readonly id: string;
  readonly plain: Map<string, PlainStore>;
  readonly product: Map<string, ProductStore>;
  readonly methods: Readonly<Record<string, MethodSpec>>;
  readonly page: KeyValue; // хранилище страницы: токен покупательницы (блок 12, часть 12е)
  module: ExtModule | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function isJsonValue(value: unknown): value is Json {
  if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

// Успех — любой 2xx: шлюз отвечает на POST функций расширения статусом 201, а не 200
// (как в theme-base extension-call.ts, «Успех — любой 2xx»).
const okReply = (reply: Reply): boolean =>
  reply.status >= 200 && reply.status < 300 && isRecord(reply.body) && reply.body.success === true;

const dataOf = (reply: Reply): ExtValue => {
  const data: unknown = isRecord(reply.body) ? reply.body.data : undefined;
  return isJsonValue(data) ? data : null;
};

// Значение атома без подписки: get() атома на миг подписывает его и запускает onMount (Р9в-10), поэтому читаем поле value.
const valueOf = (store: Atom<ExtValue>): ExtValue => {
  const value: unknown = Reflect.get(store, 'value');
  return isJsonValue(value) ? value : null;
};

const listenersOf = (store: Atom<ExtValue>): number => {
  const count: unknown = Reflect.get(store, 'lc');
  return typeof count === 'number' ? count : 0;
};

function fnUrl(config: StorefrontConfig, id: string, fn: string): string {
  const path = `/store/extensions/${encodeURIComponent(id)}/fn/${encodeURIComponent(fn)}`;
  return `${config.api.url}${path}?store_id=${encodeURIComponent(config.shop.id)}`;
}

// Запрос функции расширения (блок 12, часть 12е, Р12е-1): POST с телом и токеном покупательницы, если она вошла, — как у
// orders и auth. В превью хранилище страницы — память, токена там нет.
function fnRequest(state: ExtensionState, body: Json): JsonRequest {
  const token = tokenOf(state.page);
  return token === null ? { method: 'POST', body } : { method: 'POST', body, token };
}

// Гость: покупательницы нет или части auth на странице нет (вход — блок 10); сервер такому запросу всё равно откажет.
function isGuest(core: CoreHandle): boolean {
  try {
    return core.part('auth').$customer.get().customer === null;
  } catch {
    return true;
  }
}

// Очередь чтений одного стора: новое чтение идёт после прежнего, не параллельно (Р9в-11).
function readingQueue(): Flight {
  let tail: Promise<void> = Promise.resolve();
  const enqueue = (work: () => Promise<void>): void => {
    tail = tail.then(work).catch((error: unknown) => {
      console.error(`чтение стора расширения: ${messageOf(error)}`);
    });
  };
  return { enqueue, sync: (): Promise<void> => tail };
}

// Запись значений одним batch: подписчики не видят промежуточных состояний; ошибка подписчика — строка в консоли.
function writeAll(entries: readonly (readonly [Atom<ExtValue>, ExtValue])[]): void {
  try {
    batch(() => entries.forEach(([store, value]) => store.set(value)));
  } catch (error) {
    console.error(`подписчик стора расширения: ${messageOf(error)}`);
  }
}

// События перечитывания стора (Р9в-12): refreshOn из манифеста и, у customer-стора, вход и выход покупателя.
function refreshEvents(spec: StoreSpec): readonly string[] {
  const events = [...(spec.refreshOn ?? [])];
  if (spec.customer === true) events.push('merfy:auth:signin', 'merfy:auth:signout');
  return events;
}

function listenRefresh(events: readonly string[], onEvent: () => void): () => void {
  events.forEach((name) => document.addEventListener(name, onEvent));
  return (): void => events.forEach((name) => document.removeEventListener(name, onEvent));
}

async function readPlain(state: ExtensionState, name: string, store: PlainStore): Promise<void> {
  if (store.spec.customer === true && isGuest(state.core)) return;
  const reply = await requestJson(fnUrl(state.config, state.id, store.spec.fn), fnRequest(state, {}));
  if (okReply(reply)) {
    writeAll([[store.atom, dataOf(reply)]]);
    return;
  }
  const failure = failureOf(reasonOf(reply), `ctx.ext.${state.id}.$${name}`, reply);
  if (failure.code === 'invalid') console.error(failure.message); // чтение фоновое: значение прежнее, уведомления нет
}

async function readProducts(state: ExtensionState, store: ProductStore, ids: readonly string[]): Promise<void> {
  if (store.spec.customer === true && isGuest(state.core)) return;
  for (let at = 0; at < ids.length; at += EXT_PRODUCT_BATCH) {
    const chunk = ids.slice(at, at + EXT_PRODUCT_BATCH);
    const reply = await requestJson(
      fnUrl(state.config, state.id, store.spec.fn),
      fnRequest(state, { productIds: [...chunk] }),
    );
    if (!okReply(reply)) continue;
    const data = dataOf(reply);
    writeAll(
      chunk.flatMap((id): readonly (readonly [Atom<ExtValue>, ExtValue])[] => {
        const one = store.atoms.get(id);
        if (one === undefined) return [];
        const value: ExtValue = isRecord(data) && isJsonValue(data[id]) ? data[id] : null;
        return [[one, value]];
      }),
    );
  }
}

function rereadProducts(state: ExtensionState, store: ProductStore): void {
  const ids = [...store.atoms].filter(([, one]) => listenersOf(one) > 0).map(([id]) => id);
  if (ids.length > 0) store.queue.enqueue(() => readProducts(state, store, ids));
}

// id, подписанные при запуске секций, уходят одним вызовом: onMount добавляет их в pending, микрозадача отправляет.
function scheduleFlush(state: ExtensionState, store: ProductStore): void {
  if (store.scheduled) return;
  store.scheduled = true;
  queueMicrotask(() => {
    store.scheduled = false;
    const ids = [...store.pending].filter((id) => {
      const one = store.atoms.get(id);
      return one !== undefined && listenersOf(one) > 0;
    });
    store.pending.clear();
    if (ids.length > 0) store.queue.enqueue(() => readProducts(state, store, ids));
  });
}

function plainStoreOf(state: ExtensionState, name: string, spec: StoreSpec): PlainStore {
  const store: PlainStore = { spec, atom: atom<ExtValue>(null), queue: readingQueue() };
  onMount(store.atom, () => {
    store.queue.enqueue(() => readPlain(state, name, store));
    return listenRefresh(refreshEvents(spec), () => {
      if (listenersOf(store.atom) > 0) store.queue.enqueue(() => readPlain(state, name, store));
    });
  });
  return store;
}

function productStoreOf(spec: StoreSpec): ProductStore {
  return {
    spec,
    atoms: new Map(),
    facades: new Map(),
    queue: readingQueue(),
    pending: new Set(),
    scheduled: false,
    mounted: 0,
    stopListeners: null,
  };
}

// Подписка фасада товара: первый слушатель включает обновление, последний — выключает.
function productWatchOf(state: ExtensionState, store: ProductStore, productId: string): () => void {
  store.pending.add(productId);
  store.mounted += 1;
  if (store.stopListeners === null)
    store.stopListeners = listenRefresh(refreshEvents(store.spec), () => rereadProducts(state, store));
  scheduleFlush(state, store);
  return (): void => {
    store.pending.delete(productId);
    store.mounted -= 1;
    if (store.mounted === 0 && store.stopListeners !== null) {
      store.stopListeners();
      store.stopListeners = null;
    }
  };
}

// Фасад товара: один на id, заморожен и зарегистрирован — ctx.watch его принимает (Р9в-10).
function productFacadeOf(
  state: ExtensionState,
  name: string,
  store: ProductStore,
  productId: string,
): ReadableStore<ExtValue> {
  if (typeof productId !== 'string' || productId === '' || productId.length > PRODUCT_ID_MAX)
    throw new ShellError(
      'sdk-call-invalid',
      `ctx.ext.${state.id}.$${name}: id товара — непустая строка до ${PRODUCT_ID_MAX} знаков`,
    );
  const cached = store.facades.get(productId);
  if (cached !== undefined) return cached;
  const one = atom<ExtValue>(null);
  store.atoms.set(productId, one);
  onMount(one, () => productWatchOf(state, store, productId));
  const facade: ReadableStore<ExtValue> = Object.freeze({ get: (): ExtValue => valueOf(one) });
  registerFacade(facade, one);
  store.facades.set(productId, facade);
  return facade;
}

// Обычный стор: фасад для ctx.watch; вызов с id товара — ошибка вызова (стор не на товар).
function plainFacadeOf(state: ExtensionState, name: string, store: PlainStore): ExtStore {
  const facade: ExtStore = Object.assign(
    (): ReadableStore<ExtValue> => {
      throw new ShellError(
        'sdk-call-invalid',
        `ctx.ext.${state.id}.$${name} — стор не на товар: читайте ctx.watch(ctx.ext.${state.id}.$${name}, …)`,
      );
    },
    { get: (): ExtValue => valueOf(store.atom) },
  );
  registerFacade(facade, store.atom);
  return Object.freeze(facade);
}

// Стор на товар: сама функция — не стор (get — null, ctx.watch её не примет), фасады — у товаров.
function productFacade(state: ExtensionState, name: string, store: ProductStore): ExtStore {
  const facade: ExtStore = Object.assign(
    (productId: string): ReadableStore<ExtValue> => productFacadeOf(state, name, store, productId),
    { get: (): ExtValue => null },
  );
  return Object.freeze(facade);
}

function storeFacadeOf(state: ExtensionState, name: string, spec: StoreSpec): ExtStore {
  if (spec.by === 'product') {
    const store = state.product.get(name) ?? productStoreOf(spec);
    state.product.set(name, store);
    return productFacade(state, name, store);
  }
  const store = state.plain.get(name) ?? plainStoreOf(state, name, spec);
  state.plain.set(name, store);
  return plainFacadeOf(state, name, store);
}

// После успешного метода — перечитать сторы расширения с подписчиками и дождаться их (порядок «стор → ответ», Р9в-12).
function rereadStores(state: ExtensionState): Promise<void> {
  const waits: Promise<void>[] = [];
  state.plain.forEach((store, name) => {
    if (listenersOf(store.atom) === 0) return;
    store.queue.enqueue(() => readPlain(state, name, store));
    waits.push(store.queue.sync());
  });
  state.product.forEach((store) => {
    rereadProducts(state, store);
    waits.push(store.queue.sync());
  });
  return Promise.all(waits).then(() => undefined);
}

async function callMethod(
  state: ExtensionState,
  name: string,
  spec: MethodSpec,
  input: Readonly<Record<string, Json>> | undefined,
  options: ActionOptions | undefined,
): Promise<Result<Json>> {
  const author = `ctx.ext.${state.id}.${name}`;
  if (input !== undefined && !isRecord(input)) {
    const failure = failureOf('invalid', `${author}: аргументы — объект`);
    reportFailure(state.core, failure, options);
    return failed(failure);
  }
  if (spec.customer === true && isGuest(state.core)) {
    const failure = failureOf('unauthorized', author);
    reportFailure(state.core, failure, options);
    return failed(failure);
  }
  const reply = await requestJson(fnUrl(state.config, state.id, spec.fn), fnRequest(state, input ?? {}));
  if (!okReply(reply)) {
    const failure = failureOf(reasonOf(reply), author, reply);
    reportFailure(state.core, failure, options);
    return failed(failure);
  }
  await rereadStores(state);
  return { ok: true, data: dataOf(reply) };
}

function methodOf(state: ExtensionState, name: string, spec: MethodSpec): ExtMethod {
  return (input, options): Promise<Result<Json>> => callMethod(state, name, spec, input, options);
}

// Ключ аргумента метода — camelCase имени data-атрибута: review-id → reviewId (как product-id у cart.add, Р9в-14).
const camelOf = (param: string): string =>
  param
    .split('-')
    .map((part, index) => (index === 0 || part === '' ? part : part[0]?.toUpperCase() + part.slice(1)))
    .join('');

function markupActionOf(state: ExtensionState, id: string, name: string): MarkupAction<object> | null {
  const spec = state.methods[name];
  if (spec === undefined) return null;
  const params = [...(spec.params ?? [])];
  const method = methodOf(state, name, spec);
  return {
    params,
    call: (_api: object, values: Readonly<Record<string, string>>): Promise<Result<Json>> =>
      method(Object.fromEntries(params.map((param) => [camelOf(param), values[param] ?? '']))),
  };
}

function buildModule(state: ExtensionState): ExtModule {
  const storeFields: { [store: `$${string}`]: ExtStore } = {};
  const methodFields: { [method: string]: ExtMethod } = {};
  for (const [name, spec] of Object.entries(state.entry.stores))
    storeFields[`$${name}`] = storeFacadeOf(state, name, spec);
  for (const [name, spec] of Object.entries(state.entry.methods)) methodFields[name] = methodOf(state, name, spec);
  return Object.freeze({ ...storeFields, ...methodFields });
}

function moduleOf(state: ExtensionState): ExtModule | null {
  if (state.module === null) state.module = buildModule(state);
  return state.module;
}

const statesByApi = new WeakMap<object, Map<string, ExtensionState>>();

function statesOf(core: CoreHandle): Map<string, ExtensionState> {
  const config = core.config;
  const states = new Map<string, ExtensionState>();
  if (config === null) return states; // конфиг не прочитан: расширений на странице нет (start.ts — part-unknown)
  const page = pageStorage(window, core.mode);
  for (const [id, entry] of Object.entries(config.extensions ?? {})) {
    states.set(id, {
      core,
      config,
      entry,
      id,
      plain: new Map(),
      product: new Map(),
      methods: entry.methods,
      page,
      module: null,
    });
  }
  return states;
}

export const ext: SdkPart<'ext', object> = {
  name: EXT_PART_NAME,
  create(core: CoreHandle): object {
    const states = statesOf(core);
    const api: object = Object.freeze({});
    registerExtModules(api, (id: string): ExtModule | null => {
      const state = states.get(id);
      return state === undefined ? null : moduleOf(state);
    });
    statesByApi.set(api, states);
    return api;
  },
  markupOf(api: object, action: string): MarkupAction<object> | null {
    const state = statesByApi.get(api)?.get(action.slice(0, action.indexOf('.')));
    if (state === undefined) return null;
    return markupActionOf(state, state.id, action.slice(action.indexOf('.') + 1));
  },
};
