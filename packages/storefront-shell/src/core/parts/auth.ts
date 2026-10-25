import { ShellError } from '../../errors';
import { CUSTOMER_TOKEN_KEY, dropToken, saveToken, tokenOf } from '../customer-token';
import { type Failure, type Reply, failed, failureOf, reasonOf, reportFailure } from '../failures';
import { navigation } from '../navigation';
import { requestJson } from '../requests';
import { pageStorage, type KeyValue } from '../storage';
import { type Atom, atom, onMount, readable } from '../stores';
import type {
  ActionOptions,
  AuthModule,
  CoreHandle,
  Customer,
  CustomerState,
  ErrorCode,
  NoData,
  Result,
  SdkPart,
  VerifyArgs,
} from '../types';
import { clearFavorites, mergeFavorites } from './favorites';

// Вход покупательницы (блок 10 «Секций и SDK», 10.7, «Решил сам» пп. 16–19; часть 10в, Р10в-1…Р10в-6): вход по коду
// из письма, токен — merfy_customer_token; слияние избранного до merfy:auth:signin; возврат — только на этот сайт.

// Тексты входа (блок 10, «Коды ошибок»): секции показывают их под полем (quiet: true).
export const AUTH_TEXT = {
  email: 'Проверьте e-mail',
  code: 'Неверный код. Проверьте письмо или запросите новый',
  expired: 'Код устарел. Запросите новый',
  blocked: 'Вход для этого e-mail закрыт. Напишите в магазин',
  tooMany: 'Слишком много попыток. Попробуйте через 5 минут',
} as const;
export const ACCOUNT_PATH = '/account';
export const LOGIN_PAGE_ID = 'page-login';
// Страницы кабинета (Р10в-6): выход на них уходит на «Вход».
export const ACCOUNT_PAGE_IDS: ReadonlySet<string> = new Set(['page-profile', 'page-orders']);

// Адрес возврата после входа (п. 19): только этот сайт — от корня, не //, не /\; иначе — кабинет.
export function safeReturnPath(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\'))
    return ACCOUNT_PATH;
  return raw;
}

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

export const sessionTokenOf = (body: unknown): string | null =>
  isRecord(body) && isRecord(body.data) ? textOrNull(body.data.sessionToken) : null;

// Отказ с нашим текстом: refused и limit у входа говорят сами, тексты сервера покупательница не видит.
const authFailure = (code: ErrorCode, text: string): Failure => ({ code, message: text, notice: text });

// Статусы → причина (reasonOf(reply, byStatus)) и тексты: 429 — limit, отказы — refused со своим текстом.
const REQUEST_BY_STATUS: Readonly<Record<number, 'refused'>> = { 422: 'refused' };
const VERIFY_BY_STATUS: Readonly<Record<number, 'refused'>> = { 400: 'refused', 410: 'refused', 423: 'refused' };
const REQUEST_TEXT: Readonly<Record<number, string>> = { 422: AUTH_TEXT.email, 429: AUTH_TEXT.tooMany };
const VERIFY_TEXT: Readonly<Record<number, string>> = {
  400: AUTH_TEXT.code,
  410: AUTH_TEXT.expired,
  423: AUTH_TEXT.blocked,
  429: AUTH_TEXT.tooMany,
};

// Неудачный ответ входа: знакомый статус — свой текст, остальное — по причине ответа.
function replyFailure(
  reply: Reply,
  byStatus: Readonly<Record<number, 'refused'>>,
  texts: Readonly<Record<number, string>>,
  author: string,
): Failure {
  const reason = reasonOf(reply, byStatus);
  const text = texts[reply.status];
  if (text !== undefined && reason === 'refused') return authFailure('refused', text);
  if (text !== undefined && reason === 'rate-limit') return authFailure('limit', text);
  return failureOf(reason, author, reply);
}

// Договор RPC платформы: успех — любой 2xx с success: true (шлюз отвечает POST-ам 201, проверка dev 25.10).
const isOkReply = (reply: Reply): boolean => {
  const body = reply.body;
  return reply.status >= 200 && reply.status < 300 && typeof body === 'object' && body !== null && Reflect.get(body, 'success') === true;
};

interface ShopApi {
  readonly url: string;
  readonly storeId: string;
  readonly shopName: string;
  readonly pageId: string;
}

const shopApiOf = (core: CoreHandle): ShopApi | null => {
  const config = core.config;
  if (config === null) return null;
  return { url: config.api.url, storeId: config.shop.id, shopName: config.shop.name, pageId: config.page.id };
};

// Адрес шлюза входа (Р10в-1).
const authUrl = (conf: ShopApi, path: string): string => `${conf.url}/store/auth/${path}`;

interface AuthRuntime {
  readonly core: CoreHandle;
  readonly state: Atom<CustomerState>;
  readonly page: KeyValue;
}

const GUEST: CustomerState = { ready: true, customer: null };

const setCustomer = (rt: AuthRuntime, customer: Customer | null): void => rt.state.set({ ready: true, customer });
const setGuest = (rt: AuthRuntime): void => rt.state.set(GUEST);

// 401 при сохранённом токене (Р10в-2): токен удалён, событие merfy:auth:signout, гостья; уведомления нет.
const expireToken = (rt: AuthRuntime): void => {
  dropToken(rt.page);
  rt.core.emit('merfy:auth:signout', {});
  setGuest(rt);
};

// Чтение покупательницы: GET me с токеном; обрыв и 5xx — гостья, токен остаётся (сеть не разлогинивает).
async function readCustomer(rt: AuthRuntime): Promise<null> {
  const conf = shopApiOf(rt.core);
  const token = tokenOf(rt.page);
  if (conf === null || token === null) {
    setGuest(rt);
    return null;
  }
  const reply = await requestJson(authUrl(conf, 'me'), { method: 'GET', token });
  if (reply.status === 401) {
    expireToken(rt);
    return null;
  }
  setCustomer(rt, isOkReply(reply) ? customerOf(reply.body) : null);
  return null;
}

// Другая вкладка вошла или вышла (storage) и «Назад» из кеша (pageshow, блок 13): перечитать, пока подписаны.
function listenPage(rt: AuthRuntime): () => void {
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

// Первая подписка на $customer: токен есть, а стор ещё не готов — чтение me; дальше — события страницы (Р10в-2).
function mountState(rt: AuthRuntime): void {
  onMount(rt.state, () => {
    if (rt.core.mode !== 'preview' && !rt.state.get().ready && tokenOf(rt.page) !== null) void readCustomer(rt);
    return listenPage(rt);
  });
}

// Части избранного нет на странице — ShellError part-unknown: слияние и очистка пропускаются (Р10в-4, Р10в-6).
async function mergeGuestFavorites(rt: AuthRuntime): Promise<void> {
  try {
    await mergeFavorites(rt.core.part('favorites'));
  } catch (error) {
    if (!(error instanceof ShellError)) throw error;
  }
}

function clearGuestFavorites(rt: AuthRuntime): void {
  try {
    clearFavorites(rt.core.part('favorites'));
  } catch (error) {
    if (!(error instanceof ShellError)) throw error;
  }
}

// Отправить код письмом (Р10в-1): магазин, e-mail и название магазина — письму нужен адрес магазина (факт 19).
async function requestCodeOf(
  rt: AuthRuntime,
  args: { readonly email: string },
  options?: ActionOptions,
): Promise<Result<NoData>> {
  const email = args.email.trim();
  const conf = shopApiOf(rt.core);
  if (email === '' || conf === null) {
    const failure = failureOf('invalid', 'auth.requestCode: e-mail — непустая строка; нужен конфиг витрины');
    reportFailure(rt.core, failure, options);
    return failed(failure);
  }
  const reply = await requestJson(authUrl(conf, 'magic/request'), {
    method: 'POST',
    body: { store_id: conf.storeId, email, shopName: conf.shopName },
  });
  if (isOkReply(reply)) return { ok: true, data: {} };
  const failure = replyFailure(reply, REQUEST_BY_STATUS, REQUEST_TEXT, 'auth.requestCode: письмо с кодом');
  reportFailure(rt.core, failure, options);
  return failed(failure);
}

// Тело verify: код из шести цифр или токен ссылки; пустое — invalid без запроса (Р10в-3).
function verifyBody(args: VerifyArgs, storeId: string): Readonly<Record<string, string>> | null {
  if ('token' in args) return args.token === '' ? null : { store_id: storeId, token: args.token };
  if (args.email.trim() === '' || !/^\d{6}$/.test(args.code)) return null;
  return { store_id: storeId, email: args.email.trim(), code: args.code };
}

// Возврат после входа (Р10в-5): на «Входе» витрины — по ?redirect, если это адрес этого сайта, иначе — кабинет.
function returnTo(rt: AuthRuntime): void {
  const conf = shopApiOf(rt.core);
  if (conf === null || rt.core.mode !== 'live' || conf.pageId !== LOGIN_PAGE_ID) return;
  const redirect = new URLSearchParams(window.location.search).get('redirect');
  navigation.go(safeReturnPath(redirect));
}

// Отказ invalid без запроса: нет конфига витрины или тело входа пустое.
function invalidVerify(rt: AuthRuntime, text: string, options?: ActionOptions): Result<never> {
  const failure = failureOf('invalid', text);
  reportFailure(rt.core, failure, options);
  return failed(failure);
}

// Порядок входа (Р10в-4): токен → слияние избранного → $customer → merfy:auth:signin → возврат.
async function verifyOf(
  rt: AuthRuntime,
  args: VerifyArgs,
  options?: ActionOptions,
): Promise<Result<{ readonly customer: Customer }>> {
  const conf = shopApiOf(rt.core);
  if (conf === null) return invalidVerify(rt, 'auth.verify: нужен конфиг витрины', options);
  const body = verifyBody(args, conf.storeId);
  if (body === null)
    return invalidVerify(rt, 'auth.verify: код из шести цифр, токен ссылки; нужен конфиг витрины', options);
  const reply = await requestJson(authUrl(conf, 'magic/verify'), { method: 'POST', body });
  const customer = isOkReply(reply) ? customerOf(reply.body) : null;
  const token = isOkReply(reply) ? sessionTokenOf(reply.body) : null;
  if (customer === null || token === null) {
    const failure = replyFailure(reply, VERIFY_BY_STATUS, VERIFY_TEXT, 'auth.verify: вход по коду');
    reportFailure(rt.core, failure, options);
    return failed(failure);
  }
  saveToken(rt.page, token);
  await mergeGuestFavorites(rt);
  setCustomer(rt, customer);
  rt.core.emit('merfy:auth:signin', {});
  returnTo(rt);
  return { ok: true, data: { customer } };
}

// Выход (Р10в-6): POST logout с токеном (ответ не важен), токен удалён, избранное очищено, в кабинете — на «Вход».
async function signoutOf(rt: AuthRuntime, options?: ActionOptions): Promise<Result<NoData>> {
  const conf = shopApiOf(rt.core);
  const token = tokenOf(rt.page);
  if (token === null || conf === null) {
    const failure = failureOf('unauthorized', 'auth.signout: нет токена покупательницы');
    reportFailure(rt.core, failure, options);
    return failed(failure);
  }
  if (rt.core.mode !== 'preview') await requestJson(authUrl(conf, 'logout'), { method: 'POST', token });
  dropToken(rt.page);
  clearGuestFavorites(rt);
  setGuest(rt);
  rt.core.emit('merfy:auth:signout', {});
  if (rt.core.mode === 'live' && ACCOUNT_PAGE_IDS.has(conf.pageId)) navigation.go('/login');
  return { ok: true, data: {} };
}

// Профиль (Р10в-1): PATCH с именем и телефоном; ответ — покупательница целиком в data (user, updateProfile).
async function updateProfileOf(
  rt: AuthRuntime,
  args: { readonly name?: string; readonly phone?: string },
  options?: ActionOptions,
): Promise<Result<{ readonly customer: Customer }>> {
  const conf = shopApiOf(rt.core);
  const token = tokenOf(rt.page);
  if (token === null || conf === null) {
    const failure = failureOf('unauthorized', 'auth.updateProfile: нет токена покупательницы');
    reportFailure(rt.core, failure, options);
    return failed(failure);
  }
  const body: Record<string, string> = {};
  if (args.name !== undefined) body.name = args.name;
  if (args.phone !== undefined) body.phone = args.phone;
  const reply = await requestJson(authUrl(conf, 'profile'), { method: 'PATCH', body, token });
  const customer = isOkReply(reply) ? customerOf(reply.body) : null;
  if (customer === null) {
    const failure = failureOf(reasonOf(reply), 'auth.updateProfile: сохранение профиля', reply);
    reportFailure(rt.core, failure, options);
    return failed(failure);
  }
  setCustomer(rt, customer);
  return { ok: true, data: { customer } };
}

// Начальное состояние (Р10в-2): превью — всегда гостья; токен есть — покупательница ещё не прочитана.
function initialStateOf(mode: 'live' | 'preview', page: KeyValue): CustomerState {
  if (mode === 'preview' || tokenOf(page) === null) return GUEST;
  return { ready: false, customer: null };
}

export const auth: SdkPart<'auth', AuthModule> = {
  name: 'auth',
  create: (core: CoreHandle): AuthModule => {
    const page = pageStorage(window, core.mode);
    const rt: AuthRuntime = { core, state: atom<CustomerState>(initialStateOf(core.mode, page)), page };
    mountState(rt);
    return {
      $customer: readable(rt.state),
      requestCode: (args, options) => requestCodeOf(rt, args, options),
      verify: (args, options) => verifyOf(rt, args, options),
      signout: (options) => signoutOf(rt, options),
      updateProfile: (args, options) => updateProfileOf(rt, args, options),
    };
  },
  markup: {
    signout: {
      params: [],
      call: (api: AuthModule): Promise<Result<unknown>> => api.signout(),
    },
  },
};
