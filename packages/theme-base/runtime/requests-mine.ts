/**
 * requests-mine — «Мои заявки» покупателя (спека 118, T014): общая логика
 * страниц account/requests.astro (список) и account/request.astro (карточка)
 * для всех пяти тем. Темы НЕ пишут свой JS: страница (по образцу
 * account/order.astro) импортирует этот модуль и дёргает init-функции.
 *
 * СТИЛЬ — темы. Разметка несёт только классы, которые каждая тема уже
 * определяет для своих orders-страниц (account-page-container, account-title,
 * account-subtitle, account-order-row, account-button, account-text-link,
 * account-back-link); специфичное (переписка, галерея, kv) — нейтральные
 * инлайн-стили на rgb(var(--color-*)) с фолбеками, как это делает
 * account/order.astro. Никаких sf-* — это кабинет покупателя, не витрина.
 *
 * АВТОРИЗАЦИЯ — токен из письма («mine»-ссылка), НЕ customer-логин: ссылка
 * `/account/requests?token=<mineToken>` сохраняет токен в localStorage
 * (`merfy_requests_token`) и вычищает его из URL; страницы читают токен и
 * ходят с `Authorization: Bearer <token>`. Нет токена → НЕ редирект на
 * логин, а пустое состояние «Здесь появятся ваши заявки — ссылки приходят
 * на почту» (нейтрально).
 *
 * КОНТРАКТ ЭНДПОИНТОВ (fn-канал расширения `requests`, спека §3:
 * POST /store/extensions/requests/fn/mine*?store_id= — см. api-gateway
 * extension-fn.controller.ts; метод всегда POST, тело — JSON-объект input,
 * ответ {success, data}; в тестах замоканы, на живом сайте до них просто
 * пусто/ошибка):
 *   POST /store/extensions/requests/fn/mineList?store_id= {} →
 *       {success, data: RequestMineListItem[]}
 *   POST /store/extensions/requests/fn/mineGet?store_id= {id} →
 *       {success, data: RequestMineDetail}
 *   POST /store/extensions/requests/fn/mineReply?store_id= {id, text} →
 *       {success, data}
 * Подписи статусов приходят данными (statusText); фолбек-подписи — здесь.
 */
import { escapeRequestHtml } from './requests-form';

/** Ключ localStorage mine-токена (ссылка из письма о заявке). */
export const REQUESTS_MINE_TOKEN_KEY = 'merfy_requests_token';

/** Фолбек-подписи статусов (если бэкенд не прислал statusText). */
export const REQUEST_MINE_STATUS_LABELS: Record<string, string> = {
  new: 'Новая',
  disc: 'Обсуждается',
  wait: 'Ждёт оплаты',
  paid: 'Оплачена',
  closed: 'Закрыта',
};

/** Строка списка «Мои заявки» (контракт fn/mineList). */
export interface RequestMineListItem {
  id: string | number;
  /** Человекочитаемый номер (№2083); fallback — id. */
  number?: string | number;
  status?: string;
  /** Подпись статуса данными (приоритет над фолбеком). */
  statusText?: string;
  /** Причина закрытия (для closed). */
  statusReason?: string;
  productName?: string;
  createdAt?: string;
}

/** Что заполнил покупатель (одна строка kv). */
export interface RequestMineField {
  label: string;
  value?: string | number | boolean | null;
  /** photo/video/file рисуются галереей/строками, не kv. */
  type?: string;
  /** Список файлов (для photo/video/file). */
  files?: Array<{ url?: string; name?: string; size?: string }>;
}

/** Предложение магазина. */
export interface RequestMineOffer {
  amountCents?: number;
  amountText?: string;
  term?: string;
  /** «Действует до» — готовая строка или дата. */
  validUntil?: string;
}

/** Сообщение переписки. */
export interface RequestMineMessage {
  /** system | shop | customer. */
  author?: string;
  text?: string;
  at?: string;
  file?: string;
}

/** Карточка заявки (контракт fn/mineGet). */
export interface RequestMineDetail extends RequestMineListItem {
  fields?: RequestMineField[];
  offer?: RequestMineOffer;
  messages?: RequestMineMessage[];
  /** Можно ли отвечать (false у закрытых/оплаченных). */
  canReply?: boolean;
}

/** `12 345 ₽` из копеек; 0 — честный ноль, undefined — тире. */
export function formatRequestMineCents(cents: unknown): string {
  if (typeof cents !== 'number' || !isFinite(cents)) return '—';
  return (cents / 100).toLocaleString('ru-RU') + ' ₽';
}

/** Дата «от 03.10.26» (локаль ru-RU, как orders-страницы). */
export function formatRequestMineDate(raw: unknown): string {
  if (!raw) return '';
  const d = new Date(String(raw));
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Подпись статуса: данные → фолбек → как есть. */
export function requestMineStatusLabel(item: {
  status?: string;
  statusText?: string;
}): string {
  if (item.statusText) return item.statusText;
  const s = item.status || '';
  return REQUEST_MINE_STATUS_LABELS[s] || s || '—';
}

/**
 * Захват mine-токена из `?token=`: сохраняет в localStorage и возвращает
 * токен (страница чистит URL через history.replaceState — см. init).
 */
export function captureRequestsMineToken(search: string): string | null {
  if (typeof search !== 'string' || !search) return null;
  const qs = search.charAt(0) === '?' ? search.slice(1) : search;
  const parts = qs.split('&');
  for (let i = 0; i < parts.length; i++) {
    const kv = parts[i].split('=');
    if (kv[0] === 'token') {
      const token = decodeURIComponent(kv.slice(1).join('=') || '');
      if (!token) return null;
      try {
        localStorage.setItem(REQUESTS_MINE_TOKEN_KEY, token);
      } catch {
        /* приватный режим — токен живёт до перезагрузки */
      }
      return token;
    }
  }
  return null;
}

/** Текущий mine-токен (localStorage). */
export function getRequestsMineToken(): string {
  try {
    return localStorage.getItem(REQUESTS_MINE_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

/** Убрать ?token= из URL (history.replaceState), чтобы токен не утекал дальше. */
export function stripRequestsTokenFromUrl(): void {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has('token')) return;
    u.searchParams.delete('token');
    window.history.replaceState({}, '', u.toString());
  } catch {
    /* jsdom без history — тестам достаточно захвата токена */
  }
}

interface MineFetchResult<T> {
  ok: boolean;
  data?: T;
  status?: number;
}

function mineApiBase(): string {
  const w = window as unknown as {
    __MERFY_CONFIG__?: { apiUrl?: string; shopId?: string; storeId?: string };
  };
  return (w.__MERFY_CONFIG__ && w.__MERFY_CONFIG__.apiUrl) || 'https://gateway.merfy.ru/api';
}

function mineStoreId(): string {
  const w = window as unknown as {
    __MERFY_CONFIG__?: { shopId?: string; storeId?: string };
  };
  return (w.__MERFY_CONFIG__ && (w.__MERFY_CONFIG__.shopId || w.__MERFY_CONFIG__.storeId)) || '';
}

/** POST fn/mineList (Bearer). */
export async function fetchMyRequests(): Promise<MineFetchResult<RequestMineListItem[]>> {
  const token = getRequestsMineToken();
  if (!token) return { ok: false, status: 0 };
  try {
    const r = await fetch(
      mineApiBase() +
        '/store/extensions/requests/fn/mineList?store_id=' +
        encodeURIComponent(mineStoreId()),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        credentials: 'omit',
        body: JSON.stringify({}),
      },
    );
    const json = await r.json().catch(() => null);
    const data = json && json.success ? json.data : null;
    return { ok: r.ok && !!data, data: Array.isArray(data) ? data : [], status: r.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** POST fn/mineGet {id} (Bearer). */
export async function fetchMyRequest(id: string): Promise<MineFetchResult<RequestMineDetail>> {
  const token = getRequestsMineToken();
  if (!token || !id) return { ok: false, status: 0 };
  try {
    const r = await fetch(
      mineApiBase() +
        '/store/extensions/requests/fn/mineGet?store_id=' +
        encodeURIComponent(mineStoreId()),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        credentials: 'omit',
        body: JSON.stringify({ id }),
      },
    );
    const json = await r.json().catch(() => null);
    const data = json && json.success ? json.data : null;
    return { ok: r.ok && !!data, data: data || undefined, status: r.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** POST fn/mineReply {id, text} (Bearer). */
export async function replyMyRequest(
  id: string,
  text: string,
): Promise<MineFetchResult<unknown>> {
  const token = getRequestsMineToken();
  if (!token || !id) return { ok: false, status: 0 };
  try {
    const r = await fetch(
      mineApiBase() +
        '/store/extensions/requests/fn/mineReply?store_id=' +
        encodeURIComponent(mineStoreId()),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        credentials: 'omit',
        body: JSON.stringify({ id, text }),
      },
    );
    const json = await r.json().catch(() => null);
    return { ok: r.ok && !!(json && json.success), status: r.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/* ── разметка (общие классы тем + нейтральные инлайн-стили) ───────────── */

/** Строка списка: номер + товар + статус (+причина) + дата + «Перейти». */
export function requestMineRowHTML(item: RequestMineListItem): string {
  const no = item.number !== undefined && item.number !== null ? item.number : item.id;
  const status =
    requestMineStatusLabel(item) +
    (item.status === 'closed' && item.statusReason ? ': ' + item.statusReason.toLowerCase() : '');
  const date = formatRequestMineDate(item.createdAt);
  return (
    '<div class="order-info">' +
    '<span class="order-number">Заявка №' +
    escapeRequestHtml(no) +
    '</span>' +
    '<span class="order-date">' +
    (item.productName ? escapeRequestHtml(item.productName) + ' · ' : '') +
    escapeRequestHtml(status) +
    (date ? ' · от ' + escapeRequestHtml(date) : '') +
    '</span>' +
    '</div>' +
    '<a href="/account/request?id=' +
    encodeURIComponent(String(item.id)) +
    '" class="account-button">Перейти</a>'
  );
}

function mineFieldHTML(f: RequestMineField): string {
  if (f.type === 'photo' || f.type === 'video' || f.type === 'file') {
    const files = f.files || [];
    if (!files.length) {
      return (
        '<span style="color: rgb(var(--color-muted, 153 153 153));">' +
        (f.type === 'photo' ? 'не приложены' : f.type === 'video' ? 'не приложено' : 'не приложены') +
        '</span>'
      );
    }
    if (f.type === 'photo') {
      return (
        '<span style="display: inline-flex; flex-wrap: wrap; gap: 0.375rem;">' +
        files
          .map(
            (x) =>
              '<img src="' +
              escapeRequestHtml(x.url) +
              '" alt="' +
              escapeRequestHtml(x.name) +
              '" loading="lazy" style="width: 3.5rem; height: 3.5rem; object-fit: cover; border-radius: var(--radius-field, 6px);">',
          )
          .join('') +
        '</span>'
      );
    }
    return files
      .map(
        (x) =>
          '<span style="display: inline-flex; align-items: center; gap: 0.375rem;">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: rgb(var(--color-muted, 153 153 153)); flex-shrink: 0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>' +
          '<span>' +
          escapeRequestHtml(x.name) +
          (x.size ? ' · ' + escapeRequestHtml(x.size) : '') +
          '</span></span>',
      )
      .join('');
  }
  if (f.value === undefined || f.value === null || f.value === '') {
    return '<span style="color: rgb(var(--color-muted, 153 153 153));">не заполнено</span>';
  }
  if (typeof f.value === 'boolean') return f.value ? 'да' : 'нет';
  return escapeRequestHtml(f.value);
}

function mineMessageHTML(m: RequestMineMessage): string {
  if (m.author === 'system') {
    return (
      '<div style="text-align: center; color: rgb(var(--color-muted, 153 153 153)); font-size: 0.8125rem;">' +
      escapeRequestHtml(m.text) +
      (m.at ? ' · ' + escapeRequestHtml(m.at) : '') +
      '</div>'
    );
  }
  const mine = m.author === 'customer';
  return (
    '<div style="max-width: 86%; padding: 0.625rem 0.75rem; border-radius: 0.75rem; font-size: 0.875rem; line-height: 1.45; ' +
    (mine
      ? 'background: rgb(var(--color-surface-muted, 245 245 247)); justify-self: end; border-bottom-right-radius: 0.25rem;'
      : 'background: rgb(var(--color-surface-muted, 245 245 247)); justify-self: start; border-bottom-left-radius: 0.25rem;') +
    '">' +
    '<div>' +
    escapeRequestHtml(m.text) +
    '</div>' +
    (m.file
      ? '<div style="font-size: 0.75rem; color: rgb(var(--color-muted, 153 153 153)); margin-top: 0.25rem;">📎 ' +
        escapeRequestHtml(m.file) +
        '</div>'
      : '') +
    '<div style="font-size: 0.75rem; color: rgb(var(--color-muted, 153 153 153)); margin-top: 0.25rem;">' +
    (mine ? 'Вы' : 'Магазин') +
    (m.at ? ' · ' + escapeRequestHtml(m.at) : '') +
    '</div></div>'
  );
}

/** Карточка заявки: что заполнил + галерея + предложение + переписка + ответ. */
export function requestMineCardHTML(d: RequestMineDetail): string {
  const kv =
    '<div style="display: grid; gap: 0.5rem;">' +
    (d.fields || [])
      .map(
        (f) =>
          '<div style="display: grid; grid-template-columns: minmax(9rem, 40%) 1fr; gap: 0.75rem; align-items: start; padding: 0.5rem 0; border-bottom: 1px solid rgb(var(--color-border, 229 229 229)); font-size: 0.875rem;">' +
          '<span style="color: rgb(var(--color-muted, 153 153 153));">' +
          escapeRequestHtml(f.label) +
          '</span>' +
          '<span style="min-width: 0; overflow-wrap: anywhere; display: grid; gap: 0.375rem;">' +
          mineFieldHTML(f) +
          '</span></div>',
      )
      .join('') +
    '</div>';

  const offer = d.offer
    ? '<div style="display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.75rem; padding: 0.75rem 1rem; border: 1px solid rgb(var(--color-border, 229 229 229)); border-radius: var(--radius-card, 12px); font-size: 0.875rem;">' +
      '<span>Предложение</span>' +
      '<span style="font-size: 1rem;">' +
      (d.offer.amountText
        ? escapeRequestHtml(d.offer.amountText)
        : formatRequestMineCents(d.offer.amountCents)) +
      '</span>' +
      (d.offer.term ? '<span>срок: ' + escapeRequestHtml(d.offer.term) + '</span>' : '') +
      (d.offer.validUntil
        ? '<span style="color: rgb(var(--color-muted, 153 153 153));">действует до ' +
          escapeRequestHtml(d.offer.validUntil) +
          '</span>'
        : '') +
      '</div>'
    : '';

  const thread =
    '<div id="request-thread" style="display: grid; gap: 0.625rem;">' +
    (d.messages || []).map(mineMessageHTML).join('') +
    '</div>';

  const replyForm = d.canReply
    ? '<div style="display: grid; gap: 0.5rem;">' +
      '<label for="request-reply-text" style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0);">Ваш ответ</label>' +
      '<textarea id="request-reply-text" rows="3" maxlength="2000" placeholder="Написать магазину…" class="auth-input" style="height: auto; padding: 0.75rem 1rem; resize: vertical;"></textarea>' +
      '<button type="button" id="request-reply-send" class="account-button">Ответить</button>' +
      '<p id="request-reply-error" class="hidden" style="margin: 0; font-size: 0.75rem; color: rgb(var(--color-error, 255 148 148));"></p>' +
      '</div>'
    : '<p style="margin: 0; color: rgb(var(--color-muted, 153 153 153)); font-size: 0.875rem;">Заявка закрыта для ответов.</p>';

  return (
    kv +
    offer +
    '<h2 style="font-family: var(--font-heading); font-size: 1.125rem; margin: 0;">Переписка</h2>' +
    thread +
    replyForm
  );
}

/* ── init-функции страниц (гейт dataset.bound, astro:page-load безопасен) ── */

/**
 * Список «Мои заявки»: захват токена из ?token= (URL чистится), без токена —
 * пустое состояние (без редиректа на логин), с токеном — GET mine и строки.
 */
export function initRequestsMineList(): void {
  const root = document.getElementById('requests-list');
  if (!root || root.dataset.bound === 'true') return;
  root.dataset.bound = 'true';

  captureRequestsMineToken(window.location.search);
  stripRequestsTokenFromUrl();

  const loadingEl = document.getElementById('requests-loading');
  const emptyEl = document.getElementById('requests-empty');

  if (!getRequestsMineToken()) {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (emptyEl) emptyEl.classList.remove('hidden');
    return;
  }

  void fetchMyRequests().then((res) => {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (!res.ok) {
      if (loadingEl) {
        loadingEl.textContent = 'Не удалось загрузить заявки';
        loadingEl.classList.remove('hidden');
      }
      return;
    }
    const items = res.data || [];
    if (!items.length) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }
    root.classList.remove('hidden');
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.gap = '1.5rem';
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'account-order-row';
      row.innerHTML = requestMineRowHTML(item);
      root.appendChild(row);
    });
  });
}

/**
 * Карточка заявки: ?id= → fn/mineGet {id} → что заполнил + галерея +
 * предложение + переписка + ответ (fn/mineReply {id, text}). Ответ
 * добавляется в тред без перезагрузки; ошибка — сообщение под формой.
 */
export function initRequestsMineDetail(): void {
  const root = document.getElementById('request-content');
  if (!root || root.dataset.bound === 'true') return;
  root.dataset.bound = 'true';

  captureRequestsMineToken(window.location.search);
  stripRequestsTokenFromUrl();

  const loadingEl = document.getElementById('request-loading');
  const notFoundEl = document.getElementById('request-not-found');

  if (!getRequestsMineToken()) {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (notFoundEl) notFoundEl.classList.remove('hidden');
    return;
  }

  const id = new URLSearchParams(window.location.search).get('id') || '';
  if (!id) {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (notFoundEl) notFoundEl.classList.remove('hidden');
    return;
  }

  void fetchMyRequest(id).then((res) => {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (!res.ok || !res.data) {
      if (notFoundEl) notFoundEl.classList.remove('hidden');
      return;
    }
    const d = res.data;
    const subtitleEl = document.getElementById('request-subtitle');
    if (subtitleEl) {
      subtitleEl.textContent =
        (d.productName ? d.productName + ' · ' : '') +
        requestMineStatusLabel(d) +
        (d.createdAt ? ' · от ' + formatRequestMineDate(d.createdAt) : '');
    }
    root.innerHTML = requestMineCardHTML(d);
    root.classList.remove('hidden');

    const sendBtn = document.getElementById('request-reply-send') as HTMLButtonElement | null;
    const textEl = document.getElementById('request-reply-text') as HTMLTextAreaElement | null;
    const errEl = document.getElementById('request-reply-error');
    if (!sendBtn || !textEl) return;
    sendBtn.addEventListener('click', () => {
      const text = (textEl.value || '').trim();
      if (!text) {
        textEl.focus();
        return;
      }
      sendBtn.disabled = true;
      sendBtn.textContent = 'Отправляем…';
      if (errEl) errEl.classList.add('hidden');
      void replyMyRequest(id, text).then((r) => {
        if (r.ok) {
          const thread = document.getElementById('request-thread');
          if (thread) {
            const wrap = document.createElement('div');
            wrap.innerHTML = mineMessageHTML({ author: 'customer', text });
            thread.appendChild(wrap.firstElementChild as Node);
          }
          textEl.value = '';
          sendBtn.disabled = false;
          sendBtn.textContent = 'Ответить';
          return;
        }
        sendBtn.disabled = false;
        sendBtn.textContent = 'Ответить';
        if (errEl) {
          errEl.textContent = 'Не удалось отправить ответ. Попробуйте ещё раз.';
          errEl.classList.remove('hidden');
        }
      });
    });
  });
}
