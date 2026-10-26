import { CUSTOMER_TOKEN_KEY, dropToken, tokenOf } from '../customer-token';
import { type Reply } from '../failures';
import { requestJson } from '../requests';
import { pageStorage, type KeyValue } from '../storage';
import { type Atom, atom, onMount, readable } from '../stores';
import type { CoreHandle, Customer, CustomerModule, CustomerState, ReadableStore, SdkPart } from '../types';

// Кто вошёл (блок 15 «Секций и SDK», часть 15ж, Р15ж-1, Р15ж-4; до 15ж — в parts/auth.ts, часть 10в, Р10в-2):
// $customer — в ядре, на каждой странице. Вход по коду, выход и профиль — часть auth: её приносит в бандл страницы
// объявление секции. Состояние одно на страницу — customerRuntimeOf(core): его используют обе части.

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

// Покупательница из ответа шлюза: me и verify — data.customer; profile — data целиком (user, updateProfile).
export function customerOf(body: unknown): Customer | null {
  const data = isRecord(body) ? body.data : null;
  const raw = isRecord(data) && isRecord(data.customer) ? data.customer : data;
  if (!isRecord(raw) || typeof raw.email !== 'string' || raw.email === '') return null;
  return { email: raw.email, name: textOrNull(raw.name), phone: textOrNull(raw.phone) };
}

// Договор RPC платформы: успех — любой 2xx с success: true (шлюз отвечает POST-ам 201, проверка dev 25.10).
export const isOkReply = (reply: Reply): boolean => {
  const body = reply.body;
  return reply.status >= 200 && reply.status < 300 && typeof body === 'object' && body !== null && Reflect.get(body, 'success') === true;
};

export interface CustomerRuntime {
  readonly core: CoreHandle;
  readonly page: KeyValue;
  readonly state: Atom<CustomerState>;
  readonly $customer: ReadableStore<CustomerState>;
}

const GUEST: CustomerState = { ready: true, customer: null };

export const setCustomer = (rt: CustomerRuntime, customer: Customer | null): void => rt.state.set({ ready: true, customer });
export const setGuest = (rt: CustomerRuntime): void => rt.state.set(GUEST);

// 401 при сохранённом токене (Р10в-2): токен удалён, событие merfy:auth:signout, гостья; уведомления нет.
const expireToken = (rt: CustomerRuntime): void => {
  dropToken(rt.page);
  rt.core.emit('merfy:auth:signout', {});
  setGuest(rt);
};

// Адрес чтения покупательницы — как authUrl входа: `${config.api.url}/store/auth/…`.
const meUrlOf = (core: CoreHandle): string | null => (core.config === null ? null : `${core.config.api.url}/store/auth/me`);

// Чтение покупательницы: GET me с токеном; обрыв и 5xx — гостья, токен остаётся (сеть не разлогинивает).
async function readCustomer(rt: CustomerRuntime): Promise<null> {
  const url = meUrlOf(rt.core);
  const token = tokenOf(rt.page);
  if (url === null || token === null) {
    setGuest(rt);
    return null;
  }
  const reply = await requestJson(url, { method: 'GET', token });
  if (reply.status === 401) {
    expireToken(rt);
    return null;
  }
  setCustomer(rt, isOkReply(reply) ? customerOf(reply.body) : null);
  return null;
}

// Другая вкладка вошла или вышла (storage) и «Назад» из кеша (pageshow, блок 13): перечитать, пока подписаны.
function listenPage(rt: CustomerRuntime): () => void {
  const signal = new AbortController();
  const reread = (): void => {
    if (tokenOf(rt.page) === null) return void setGuest(rt);
    void readCustomer(rt);
  };
  const onStorage = (event: StorageEvent): void => {
    if (event.key === CUSTOMER_TOKEN_KEY) reread();
  };
  const onShow = (event: Event): void => {
    if (Reflect.get(event, 'persisted') === true) reread();
  };
  window.addEventListener('storage', onStorage, { signal: signal.signal });
  window.addEventListener('pageshow', onShow, { signal: signal.signal });
  return () => signal.abort();
}

// Начальное состояние (Р10в-2): превью — всегда гостья; токен есть — покупательница ещё не прочитана.
function initialStateOf(mode: 'live' | 'preview', page: KeyValue): CustomerState {
  if (mode === 'preview' || tokenOf(page) === null) return GUEST;
  return { ready: false, customer: null };
}

const RUNTIMES = new WeakMap<CoreHandle, CustomerRuntime>();

// Состояние покупательницы страницы: одно на ядро; первый вызов создаёт его и вешает чтение me на первую подписку.
export function customerRuntimeOf(core: CoreHandle): CustomerRuntime {
  const known = RUNTIMES.get(core);
  if (known !== undefined) return known;
  const page = pageStorage(window, core.mode);
  const state = atom<CustomerState>(initialStateOf(core.mode, page));
  const rt: CustomerRuntime = { core, page, state, $customer: readable(state) };
  onMount(state, () => {
    if (core.mode !== 'preview' && !state.get().ready && tokenOf(page) !== null) void readCustomer(rt);
    return listenPage(rt);
  });
  RUNTIMES.set(core, rt);
  return rt;
}

export const customer: SdkPart<'customer', CustomerModule> = {
  name: 'customer',
  create: (core: CoreHandle): CustomerModule => ({ $customer: customerRuntimeOf(core).$customer }),
};
