import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CUSTOMER_TOKEN_KEY } from '../src/core/customer-token';
import { navigation } from '../src/core/navigation';
import { AUTH_TEXT, auth, safeReturnPath } from '../src/core/parts/auth';
import { FAVORITES_KEY, favorites } from '../src/core/parts/favorites';
import { watchSource } from '../src/core/stores';
import type { CoreHandle, FavoritesModule, ModuleName, Modules, ReadableStore } from '../src/core/types';
import { SHOP_ID, fakeCore, fakeGateway, storefrontConfig } from './sdk-support';

// Вход покупательницы (блок 10 «Секций и SDK», 10.7, «Решил сам» пп. 16–19; часть 10в, Р10в-1…Р10в-6): по коду из
// письма, токен — merfy_customer_token; слияние избранного до merfy:auth:signin; возврат — только на этот сайт.
const STORE_UNMOUNT_DELAY = 1000;
const NOW = 1_800_000_000_000;
const TOKEN = 't-customer-1';
const ANNA = { id: 'c-1', shopId: SHOP_ID, email: 'anna@example.ru', name: 'Анна', phone: null, status: 'active' };
const stops: Array<() => void> = [];
let go: ReturnType<typeof vi.spyOn>;

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await vi.advanceTimersByTimeAsync(0);
};
const watch = <T>(store: ReadableStore<T>): void => {
  stops.push(watchSource(store)?.listen(() => undefined) ?? (() => undefined));
};
const meReply = { status: 200, body: { success: true, data: { customer: ANNA, session: {} } } };
const verifyReply = {
  status: 200,
  body: { success: true, data: { customer: ANNA, sessionToken: 't-new', isNew: false } },
};
const emptyWishlist = { status: 200, body: { success: true, data: [] } };
const headersOf = (index: number): unknown => vi.mocked(fetch).mock.calls[index]?.[1]?.headers;

// Ядро с частью избранного: вход сливает избранное, выход его очищает. pageId — страница конфига.
function coreWith(pageId = 'home', mode: 'live' | 'preview' = 'live') {
  const base = storefrontConfig(mode);
  const handle = fakeCore(mode, { ...base, page: { id: pageId, path: '/' } });
  let fav: FavoritesModule | null = null;
  const replaced: { -readonly [K in ModuleName]?: Modules[K] } = {};
  const signinAt: number[] = [];
  const calls = (): number => vi.mocked(fetch).mock.calls.length;
  const core: CoreHandle = {
    ...handle.core,
    emit: (name, detail) => {
      if (name === 'merfy:auth:signin') signinAt.push(calls());
      handle.core.emit(name, detail);
    },
    part: <N extends ModuleName>(name: N): Modules[N] => {
      const own: Modules[N] | undefined = replaced[name];
      if (own !== undefined) return own;
      return handle.core.part(name);
    },
  };
  fav = favorites.create(core);
  replaced.favorites = fav;
  return { core, fav, signinAt, named: handle.named };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  go = vi.spyOn(navigation, 'go').mockImplementation(() => undefined);
});

afterEach(async () => {
  stops.splice(0).forEach((stop) => stop());
  await vi.advanceTimersByTimeAsync(STORE_UNMOUNT_DELAY * 2);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('$customer', () => {
  it('гостья без токена — сразу ready, запросов нет', async () => {
    const gateway = fakeGateway();
    const module = auth.create(coreWith().core);
    watch(module.$customer);
    await settle();
    expect(module.$customer.get()).toEqual({ ready: true, customer: null });
    expect(gateway.calls).toEqual([]);
  });

  it('токен — GET me с Bearer при первой подписке; до ответа ready: false; в сторе — e-mail, имя, телефон', async () => {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    const gateway = fakeGateway();
    gateway.answer('GET /store/auth/me', meReply);
    const module = auth.create(coreWith().core);
    expect(module.$customer.get()).toEqual({ ready: false, customer: null });
    watch(module.$customer);
    await settle();
    expect(module.$customer.get()).toEqual({
      ready: true,
      customer: { email: 'anna@example.ru', name: 'Анна', phone: null },
    });
    expect(headersOf(0)).toEqual({ authorization: `Bearer ${TOKEN}` });
  });

  it('401 — токен удалён, merfy:auth:signout, гостья; обрыв — гостья, токен остаётся', async () => {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    const gateway = fakeGateway();
    gateway.answer('GET /store/auth/me', 'network', { status: 401, body: { message: 'Invalid or expired session' } });
    const first = coreWith();
    const offline = auth.create(first.core);
    watch(offline.$customer);
    await settle();
    expect([offline.$customer.get(), localStorage.getItem(CUSTOMER_TOKEN_KEY)]).toEqual([
      { ready: true, customer: null },
      TOKEN,
    ]);
    const second = coreWith();
    const expired = auth.create(second.core);
    watch(expired.$customer);
    await settle();
    expect(localStorage.getItem(CUSTOMER_TOKEN_KEY)).toBeNull();
    expect(second.named('merfy:auth:signout')).toEqual([{}]);
    expect(second.named('merfy:notice:show')).toEqual([]);
  });

  it('другая вкладка вошла — стор перечитан; «Назад» из кеша — перечитан', async () => {
    const gateway = fakeGateway();
    gateway.answer('GET /store/auth/me', meReply, meReply);
    const module = auth.create(coreWith().core);
    watch(module.$customer);
    await settle();
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    window.dispatchEvent(new StorageEvent('storage', { key: CUSTOMER_TOKEN_KEY }));
    await settle();
    expect(module.$customer.get().customer?.email).toBe('anna@example.ru');
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    await settle();
    expect(gateway.keys()).toEqual(['GET /store/auth/me', 'GET /store/auth/me']);
  });
});

describe('вход по коду', () => {
  it('requestCode — POST magic/request: магазин, e-mail, название магазина; ответ { ok: true, data: {} }', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/auth/magic/request', { status: 200, body: { success: true } });
    const module = auth.create(coreWith().core);
    expect(await module.requestCode({ email: 'anna@example.ru' })).toEqual({ ok: true, data: {} });
    expect(gateway.calls).toEqual([
      {
        key: 'POST /store/auth/magic/request',
        body: { store_id: SHOP_ID, email: 'anna@example.ru', shopName: 'Шарфы' },
      },
    ]);
  });

  it('requestCode: 429 — limit, 422 — refused «Проверьте e-mail»; пустой e-mail — invalid без запроса', async () => {
    const gateway = fakeGateway();
    gateway.answer(
      'POST /store/auth/magic/request',
      { status: 429, body: { success: false, code: 'RATE_LIMIT_EXCEEDED' } },
      { status: 422, body: { success: false, code: 'VALIDATION_ERROR' } },
    );
    const module = auth.create(coreWith().core);
    const quiet = { quiet: true };
    expect(await module.requestCode({ email: 'anna@example.ru' }, quiet)).toEqual({
      ok: false,
      error: { code: 'limit', message: AUTH_TEXT.tooMany },
    });
    expect(await module.requestCode({ email: 'anna@' }, quiet)).toEqual({
      ok: false,
      error: { code: 'refused', message: AUTH_TEXT.email },
    });
    expect((await module.requestCode({ email: '  ' }, quiet)).ok).toBe(false);
    expect(gateway.calls).toHaveLength(2);
  });

  it('verify кодом — токен записан, избранное слито до merfy:auth:signin, $customer — из ответа', async () => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify({ ids: [{ productId: 'p1', addedAt: NOW }] }));
    const gateway = fakeGateway();
    gateway.answer('POST /store/auth/magic/verify', verifyReply);
    gateway.answer('GET /storefront/wishlist', emptyWishlist);
    gateway.answer('PUT /storefront/wishlist', emptyWishlist);
    const { core, signinAt, named } = coreWith();
    const module = auth.create(core);
    expect(await module.verify({ email: 'anna@example.ru', code: '123456' })).toEqual({
      ok: true,
      data: { customer: { email: 'anna@example.ru', name: 'Анна', phone: null } },
    });
    expect(gateway.calls[0]).toEqual({
      key: 'POST /store/auth/magic/verify',
      body: { store_id: SHOP_ID, email: 'anna@example.ru', code: '123456' },
    });
    expect(localStorage.getItem(CUSTOMER_TOKEN_KEY)).toBe('t-new');
    expect(gateway.keys()).toEqual([
      'POST /store/auth/magic/verify',
      'GET /storefront/wishlist',
      'PUT /storefront/wishlist',
    ]);
    expect(signinAt).toEqual([3]);
    expect(named('merfy:auth:signin')).toEqual([{}]);
    expect(localStorage.getItem(FAVORITES_KEY)).toBeNull();
    expect(module.$customer.get().customer?.name).toBe('Анна');
    expect(go).not.toHaveBeenCalled();
  });

  it('verify ссылкой на «Входе» — тело с token, переход по ?redirect; чужой адрес — /account; превью — без перехода', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/auth/magic/verify', verifyReply, verifyReply, verifyReply);
    gateway.answer('GET /storefront/wishlist', emptyWishlist, emptyWishlist, emptyWishlist);
    gateway.answer('PUT /storefront/wishlist', emptyWishlist, emptyWishlist, emptyWishlist);
    window.history.replaceState(null, '', '/verify?token=abc&redirect=%2Faccount%2Forders');
    await auth.create(coreWith('page-login').core).verify({ token: 'abc' });
    expect(gateway.calls[0]).toEqual({
      key: 'POST /store/auth/magic/verify',
      body: { store_id: SHOP_ID, token: 'abc' },
    });
    expect(go).toHaveBeenLastCalledWith('/account/orders');
    window.history.replaceState(null, '', '/verify?token=abc&redirect=%2F%2Fevil.example');
    await auth.create(coreWith('page-login').core).verify({ token: 'abc' });
    expect(go).toHaveBeenLastCalledWith('/account');
    await auth.create(coreWith('page-login', 'preview').core).verify({ token: 'abc' });
    expect(go).toHaveBeenCalledTimes(2);
  });

  it('вошедшая на «Входе» — attach сразу уводит по адресу возврата; гостья, превью и другие страницы — нет', () => {
    fakeGateway();
    const host = (mode: 'live' | 'preview') =>
      ({ element: document.createElement('div'), name: 'shop:login', id: 'login-1', mode, signal: new AbortController().signal });
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    window.history.replaceState(null, '', '/login?redirect=%2Faccount%2Forders');
    auth.attach(auth.create(coreWith('page-login').core), host('live'));
    expect(go).toHaveBeenLastCalledWith('/account/orders');
    localStorage.removeItem(CUSTOMER_TOKEN_KEY);
    go.mockClear();
    auth.attach(auth.create(coreWith('page-login').core), host('live'));
    auth.attach(auth.create(coreWith('page-profile').core), host('live'));
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    auth.attach(auth.create(coreWith('page-login').core), host('preview'));
    expect(go).not.toHaveBeenCalled();
    localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  });

  it('verify: 400, 410, 423 — refused со своими текстами; токен не записан; код не из 6 цифр — без запроса', async () => {
    const gateway = fakeGateway();
    gateway.answer(
      'POST /store/auth/magic/verify',
      { status: 400, body: { success: false, code: 'MAGIC_INVALID' } },
      { status: 410, body: { success: false, code: 'MAGIC_EXPIRED' } },
      { status: 423, body: { success: false, code: 'CUSTOMER_BLOCKED' } },
    );
    const module = auth.create(coreWith().core);
    const messages: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const result = await module.verify({ email: 'anna@example.ru', code: '123456' }, { quiet: true });
      messages.push(result.ok ? 'ok' : `${result.error.code}: ${result.error.message}`);
    }
    expect(messages).toEqual([
      `refused: ${AUTH_TEXT.code}`,
      `refused: ${AUTH_TEXT.expired}`,
      `refused: ${AUTH_TEXT.blocked}`,
    ]);
    expect(localStorage.getItem(CUSTOMER_TOKEN_KEY)).toBeNull();
    expect((await module.verify({ email: 'anna@example.ru', code: '12a' }, { quiet: true })).ok).toBe(false);
    expect(gateway.calls).toHaveLength(3);
  });

  it('safeReturnPath: только адрес этого сайта', () => {
    expect(safeReturnPath('/account/orders?n=12')).toBe('/account/orders?n=12');
    for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', '', null, undefined])
      expect(safeReturnPath(bad)).toBe('/account');
  });
});

describe('выход и профиль', () => {
  it('signout — POST logout с токеном, токен удалён, избранное очищено, merfy:auth:signout; в кабинете — на /login', async () => {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    const gateway = fakeGateway();
    gateway.answer('POST /store/auth/logout', { status: 200, body: { success: true } });
    const { core, named } = coreWith('page-profile');
    const module = auth.create(core);
    expect(await module.signout()).toEqual({ ok: true, data: {} });
    expect(gateway.keys()).toEqual(['POST /store/auth/logout']);
    expect(headersOf(0)).toEqual({ authorization: `Bearer ${TOKEN}` });
    expect(localStorage.getItem(CUSTOMER_TOKEN_KEY)).toBeNull();
    expect(module.$customer.get()).toEqual({ ready: true, customer: null });
    expect(named('merfy:auth:signout')).toEqual([{}]);
    expect(go).toHaveBeenCalledWith('/login');
  });

  it('signout: обрыв logout — всё равно выход', async () => {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    fakeGateway().answer('POST /store/auth/logout', 'network');
    const module = auth.create(coreWith().core);
    expect((await module.signout()).ok).toBe(true);
    expect(localStorage.getItem(CUSTOMER_TOKEN_KEY)).toBeNull();
    expect(go).not.toHaveBeenCalled();
  });

  it('updateProfile — PATCH profile с именем и телефоном; $customer — из ответа (data — покупатель целиком)', async () => {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    const gateway = fakeGateway();
    gateway.answer('PATCH /store/auth/profile', {
      status: 200,
      body: { success: true, data: { ...ANNA, name: 'Анна К.', phone: '+79001234567' } },
    });
    const module = auth.create(coreWith().core);
    expect(await module.updateProfile({ name: 'Анна К.', phone: '+79001234567' })).toEqual({
      ok: true,
      data: { customer: { email: 'anna@example.ru', name: 'Анна К.', phone: '+79001234567' } },
    });
    expect(gateway.calls).toEqual([
      { key: 'PATCH /store/auth/profile', body: { name: 'Анна К.', phone: '+79001234567' } },
    ]);
    expect(module.$customer.get().customer?.phone).toBe('+79001234567');
  });

  it('updateProfile без токена — unauthorized без запроса', async () => {
    const gateway = fakeGateway();
    const result = await auth.create(coreWith().core).updateProfile({ name: 'Анна' }, { quiet: true });
    expect(result.ok ? null : result.error.code).toBe('unauthorized');
    expect(gateway.calls).toEqual([]);
  });
});

// Договор RPC платформы (проверка dev 25.10): успех — любой 2xx с success: true; шлюз (Nest) отвечает POST-ам 201.
describe('успех ответа — любой 2xx, не только 200', () => {
  it('requestCode: 201 magic/request — { ok: true }', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/auth/magic/request', { status: 201, body: { success: true } });
    const module = auth.create(coreWith().core);
    expect(await module.requestCode({ email: 'anna@example.ru' })).toEqual({ ok: true, data: {} });
    expect(gateway.keys()).toEqual(['POST /store/auth/magic/request']);
  });

  it('verify: 201 magic/verify — токен записан, покупательница в сторе', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/auth/magic/verify', {
      status: 201,
      body: { success: true, data: { customer: ANNA, sessionToken: 't-new', isNew: false } },
    });
    gateway.answer('GET /storefront/wishlist', emptyWishlist);
    const { core, signinAt } = coreWith();
    const module = auth.create(core);
    expect((await module.verify({ email: 'anna@example.ru', code: '123456' })).ok).toBe(true);
    expect(localStorage.getItem(CUSTOMER_TOKEN_KEY)).toBe('t-new');
    expect(module.$customer.get().customer?.email).toBe('anna@example.ru');
    expect(signinAt.length).toBeGreaterThan(0);
  });

  it('signout: 201 logout — выход, токен удалён', async () => {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    const gateway = fakeGateway();
    gateway.answer('POST /store/auth/logout', { status: 201, body: { success: true } });
    const module = auth.create(coreWith().core);
    expect(await module.signout()).toEqual({ ok: true, data: {} });
    expect(localStorage.getItem(CUSTOMER_TOKEN_KEY)).toBeNull();
    expect(module.$customer.get()).toEqual({ ready: true, customer: null });
  });
});
