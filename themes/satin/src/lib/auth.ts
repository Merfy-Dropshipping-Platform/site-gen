/**
 * Аутентификация покупателя (Rose) — nanostores-стор, БЕЗ React.
 *
 * Зеркалит паттерн стора порта ({@link ./wishlist}.ts: self-contained lib +
 * window-глобал + initAuthUI-делегат) и контракт `/store/auth/*` бэкенда
 * (тот же, что legacy `public/scripts/customer-auth.js`, который этот модуль
 * заменяет). Состояние — на nanostores (`atom` + `persistentAtom`), подписка
 * из Astro-`<script>` идёт через `.subscribe()` (vanilla, без React-острова).
 *
 * ПИЛОТ-ЭТАЛОН для раскатки на bloom/flux/satin/vanilla: контракт стора
 * (имена экшенов, ключ токена, window-глобал) зеркалится per-theme; меняется
 * только разметка страниц/компонентов.
 *
 * Конфиг (apiUrl + storeId) читается из `window.__MERFY_CONFIG__` — его ставит
 * inline-скрипт страницы (как cart.astro), apiUrl уже включает `/api`, shopId
 * патчится build'ом (`patchShopIdInDist`) / падает на `window.__MERFY_SITE_ID__`.
 */
import { atom, computed } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';

// Ключ localStorage — совместим с legacy customer-store.js (raw-строка токена),
// чтобы существующая сессия подхватилась без релогина.
const TOKEN_KEY = 'merfy_customer_token';

export interface CustomerProfile {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  emailVerified?: boolean;
  defaultAddress?: unknown;
}

/** Ошибка auth-запроса — несёт code/error/message бэкенда для UI. */
export interface AuthError {
  status?: number;
  success?: false;
  code?: string;
  error?: string;
  message?: string;
}

// ── Состояние (nanostores) ──────────────────────────────────────────────────
/** Bearer-токен сессии (30 дней). persistentAtom хранит raw-строку под TOKEN_KEY. */
export const $token = persistentAtom<string | null>(TOKEN_KEY, null, {
  encode: (v) => v ?? '',
  decode: (v) => (v ? v : null),
});
/** Профиль текущего покупателя (in-memory; заполняется fetchMe). */
export const $customer = atom<CustomerProfile | null>(null);
/** Статус загрузки сессии (для UI: спиннер/гость/вошёл). */
export const $authStatus = atom<'idle' | 'loading' | 'authed' | 'guest'>('idle');
/** Залогинен ли — реактивно от наличия токена. */
export const $isLoggedIn = computed($token, (t) => !!t);

/** Синхронные геттеры для bundled/inline-скриптов страниц. */
export const getToken = (): string | null => $token.get();
export const isLoggedIn = (): boolean => !!$token.get();

export function navTo(path: string): void {
  if (typeof window === 'undefined') return;
  if (window.self !== window.top) {
    // В превью конструктора (iframe) навигируем САМ iframe на нужную storefront-
    // страницу через ?page= того же preview-URL (gateway). Надёжно: не зависит от
    // postMessage/конструктора/перезагрузок и не уходит на 404-маршрут gateway.
    // Query отбрасываем — email/redirect берутся из sessionStorage/дефолтов.
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('page', path.split('?')[0].split('#')[0]);
      window.location.href = u.toString();
      return;
    } catch (e) {
      /* fallthrough to hard nav */
    }
  }
  window.location.href = path;
}

// ── Конфиг (apiUrl + storeId) из window ─────────────────────────────────────
interface MerfyConfig {
  apiUrl?: string;
  apiBase?: string;
  shopId?: string;
  storeId?: string;
  siteId?: string;
}
function getConfig(): { apiUrl: string; storeId: string } {
  const w = window as unknown as {
    __MERFY_CONFIG__?: MerfyConfig;
    __MERFY_API_BASE__?: string;
    __MERFY_SITE_ID__?: string;
  };
  const cfg = w.__MERFY_CONFIG__ || {};
  let apiUrl =
    cfg.apiUrl || cfg.apiBase || w.__MERFY_API_BASE__ || 'https://gateway.merfy.ru/api';
  apiUrl = String(apiUrl).replace(/\/+$/, '');
  // Бэкенд маршрут — /api/store/auth/*; гарантируем суффикс /api.
  if (!/\/api$/.test(apiUrl)) apiUrl += '/api';
  const storeId = String(
    cfg.shopId || cfg.storeId || cfg.siteId || w.__MERFY_SITE_ID__ || '',
  );
  return { apiUrl, storeId };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
async function request<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<{ success: boolean; data?: T; [k: string]: unknown }> {
  const { apiUrl } = getConfig();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  const token = $token.get();
  if (token && !headers['Authorization']) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${apiUrl}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && !data?.success) {
    throw { status: response.status, ...data } as AuthError;
  }
  return data;
}

/** Сохранить сессию из ответа, если бэкенд выдал sessionToken (login/auto-login). */
function captureSession(result: { success?: boolean; data?: { sessionToken?: string } }): void {
  if (result?.success && result.data?.sessionToken) {
    $token.set(result.data.sessionToken);
  }
}

// ── Экшены (контракт зеркалит customer-auth.js) ─────────────────────────────
export async function register(input: { email: string; name: string; password: string }) {
  const { storeId } = getConfig();
  const result = await request<{ sessionToken?: string }>('/store/auth/register', {
    method: 'POST',
    body: JSON.stringify({ store_id: storeId, ...input }),
  });
  captureSession(result);
  return result;
}

/** Регистрация по инвайт-токену из e-mail (после гостевого заказа). */
export async function inviteRegister(input: { token: string; password: string }) {
  const result = await request<{ token?: string; sessionToken?: string }>(
    '/store/auth/invite-register',
    { method: 'POST', body: JSON.stringify(input) },
  );
  // invite-register возвращает token (легаси) или sessionToken.
  const t = result?.data?.sessionToken || result?.data?.token;
  if (result?.success && t) $token.set(t);
  return result;
}

export async function login(input: { email: string; password: string }) {
  const { storeId } = getConfig();
  const result = await request<{ sessionToken?: string }>('/store/auth/login', {
    method: 'POST',
    body: JSON.stringify({ store_id: storeId, ...input }),
  });
  captureSession(result);
  return result;
}

export async function logout() {
  try {
    await request('/store/auth/logout', { method: 'POST' });
  } catch {
    // logout идемпотентен на клиенте — токен чистим в любом случае.
  }
  $token.set(null);
  $customer.set(null);
  $authStatus.set('guest');
}

/** Загрузить профиль текущего покупателя; при невалидном токене — разлогинить. */
export async function fetchMe(): Promise<CustomerProfile | null> {
  if (!$token.get()) {
    $authStatus.set('guest');
    return null;
  }
  $authStatus.set('loading');
  try {
    const result = await request<{ customer?: CustomerProfile } & CustomerProfile>(
      '/store/auth/me',
    );
    const customer = (result.data?.customer || result.data || null) as CustomerProfile | null;
    $customer.set(customer);
    $authStatus.set(customer ? 'authed' : 'guest');
    return customer;
  } catch (err: any) {
    // Сессию чистим ТОЛЬКО при явном 401 (невалидный токен). Сетевые ошибки и
    // ERR_ABORTED (запрос прерван навигацией/View Transitions на не-account
    // странице) НЕ должны разлогинивать — токен сохраняем, профиль подтянется.
    if (err?.status === 401) {
      $token.set(null);
      $customer.set(null);
    }
    $authStatus.set('guest');
    return null;
  }
}

export async function updateProfile(input: {
  name?: string;
  phone?: string;
  defaultAddress?: unknown;
}) {
  const result = await request<{ customer?: CustomerProfile }>('/store/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  if (result?.data?.customer) $customer.set(result.data.customer);
  return result;
}

export async function forgotPassword(input: { email: string }) {
  const { storeId } = getConfig();
  return request('/store/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ store_id: storeId, ...input }),
  });
}

export async function resetPassword(input: { token: string; password: string }) {
  const result = await request<{ sessionToken?: string }>('/store/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  captureSession(result);
  return result;
}

export async function verifyEmail(input: { token: string }) {
  return request('/store/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ── OTP-сброс пароля (4-значный код) ────────────────────────────────────────
export async function requestResetOTP(input: { email: string; shopName?: string }) {
  const { storeId } = getConfig();
  return request('/store/auth/request-reset-otp', {
    method: 'POST',
    body: JSON.stringify({ shopId: storeId, ...input }),
  });
}
export async function verifyResetOTP(input: { email: string; code: string }) {
  const { storeId } = getConfig();
  return request<{ resetCredential: string; expiresAt: string }>('/store/auth/verify-reset-otp', {
    method: 'POST',
    body: JSON.stringify({ shopId: storeId, ...input }),
  });
}
export async function resendResetOTP(input: { email: string; shopName?: string }) {
  const { storeId } = getConfig();
  return request('/store/auth/resend-reset-otp', {
    method: 'POST',
    body: JSON.stringify({ shopId: storeId, ...input }),
  });
}
export async function setNewPassword(input: { resetCredential: string; password: string }) {
  return request('/store/auth/set-new-password', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ── OTP-верификация e-mail при регистрации ──────────────────────────────────
export async function requestEmailVerifyOTP(input: { email: string; shopName?: string }) {
  const { storeId } = getConfig();
  return request('/store/auth/request-email-verify-otp', {
    method: 'POST',
    body: JSON.stringify({ shopId: storeId, ...input }),
  });
}
/** Подтвердить e-mail OTP → на успехе бэкенд выдаёт sessionToken (авто-логин). */
export async function verifyEmailOTP(input: { email: string; code: string }) {
  const { storeId } = getConfig();
  const result = await request<{ sessionToken?: string; customerId?: string }>(
    '/store/auth/verify-email-otp',
    { method: 'POST', body: JSON.stringify({ shopId: storeId, ...input }) },
  );
  captureSession(result);
  return result;
}
export async function resendVerification(input: { email: string }) {
  const { storeId } = getConfig();
  return request('/store/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ shopId: storeId, ...input }),
  });
}

// ── Magic Link (passwordless вход/регистрация) ──────────────────────────────
/** Запросить magic-ссылку + 6-значный код на email (для новых и существующих). */
export async function requestMagicLink(input: { email: string; shopName?: string }) {
  const { storeId } = getConfig();
  return request('/store/auth/magic/request', {
    method: 'POST',
    body: JSON.stringify({ store_id: storeId, ...input }),
  });
}
/** Подтвердить вход по ссылке (token) ИЛИ по коду (email+code) → выдаёт sessionToken. */
export async function verifyMagicLink(input: { token?: string; email?: string; code?: string }) {
  const { storeId } = getConfig();
  const result = await request<{ sessionToken?: string; isNew?: boolean }>(
    '/store/auth/magic/verify',
    { method: 'POST', body: JSON.stringify({ store_id: storeId, ...input }) },
  );
  captureSession(result);
  return result;
}

// ── Заказы покупателя (/store/orders, Bearer) ──
export interface CustomerOrderSummary {
  orderNumber: string;
  createdAt: string;
  status?: string;
  total?: number;
}
/** Список заказов текущего покупателя (исключая корзины). */
export async function fetchOrders(params?: { skip?: number; take?: number }) {
  const { storeId } = getConfig();
  const skip = params?.skip ?? 0;
  const take = params?.take ?? 50;
  const qs = `?skip=${skip}&take=${take}` + (storeId ? `&store_id=${encodeURIComponent(storeId)}` : '');
  return request<CustomerOrderSummary[] | { items: CustomerOrderSummary[] }>(`/store/orders${qs}`);
}
/** Детали заказа по номеру. */
export async function fetchOrder(orderNumber: string) {
  return request<any>(`/store/orders/${encodeURIComponent(orderNumber)}`);
}
/** Отмена заказа с указанием причины. */
export async function cancelOrder(orderNumber: string, reason: string) {
  return request(`/store/orders/${encodeURIComponent(orderNumber)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// ── Глобал для inline-скриптов (зеркало window.__roseWishlist) ──────────────
declare global {
  interface Window {
    __satinAuth?: typeof satinAuth;
    __satinAuthBound?: boolean;
  }
}

export const satinAuth = {
  // сторы
  $token,
  $customer,
  $authStatus,
  $isLoggedIn,
  // геттеры для inline-скриптов
  isLoggedIn: () => !!$token.get(),
  getToken: () => $token.get(),
  // экшены
  register,
  login,
  logout,
  fetchMe,
  updateProfile,
  forgotPassword,
  resetPassword,
  verifyEmail,
  requestResetOTP,
  verifyResetOTP,
  resendResetOTP,
  setNewPassword,
  requestEmailVerifyOTP,
  verifyEmailOTP,
  resendVerification,
  requestMagicLink,
  verifyMagicLink,
  fetchOrders,
  fetchOrder,
  cancelOrder,
};

/**
 * initAuthUI — выставляет window.__satinAuth (для inline-скриптов карточек/хедера),
 * грузит профиль если есть токен и красит auth-зависимые элементы хедера:
 *  • [data-auth-link] — href → /account (вошёл) или /login (гость);
 *  • [data-auth-only] — показывать только вошедшим (иначе hidden);
 *  • [data-guest-only] — показывать только гостям.
 * Идемпотентен (флаг на window) — безопасно звать на каждой странице и после
 * View Transitions (astro:page-load).
 */
export function initAuthUI(): void {
  if (typeof window === 'undefined') return;
  window.__satinAuth = satinAuth;

  const paint = (loggedIn: boolean) => {
    document.querySelectorAll<HTMLAnchorElement>('[data-auth-link]').forEach((a) => {
      a.setAttribute('href', loggedIn ? '/account' : '/login');
    });
    document.querySelectorAll<HTMLElement>('[data-auth-only]').forEach((el) => {
      el.hidden = !loggedIn;
    });
    document.querySelectorAll<HTMLElement>('[data-guest-only]').forEach((el) => {
      el.hidden = loggedIn;
    });
  };

  if (!window.__satinAuthBound) {
    window.__satinAuthBound = true;
    $isLoggedIn.subscribe((loggedIn) => paint(loggedIn));
    document.addEventListener('astro:page-load', () => paint(!!$token.get()));
  } else {
    paint(!!$token.get());
  }

  // Фоновая подгрузка профиля (не блокирует рендер).
  if ($token.get() && $authStatus.get() === 'idle') void fetchMe();
}
