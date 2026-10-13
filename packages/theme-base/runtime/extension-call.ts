/**
 * extension-call — общий канал витрины к расширениям магазина: карта точек
 * (`GET /store/extensions/storefront`), вызов функции расширения
 * (`POST /store/extensions/:id/fn/:name`), токен покупателя, экранирование и
 * проверка ссылок. Им пользуются форма покупки (`extension-purchase.ts`),
 * загрузка файлов (`extension-upload.ts`) и записи в «Моих заказах»
 * (`extension-orders.ts`), чтобы они не разошлись в том, как ходят к шлюзу и
 * чему верят.
 *
 * Шлюз отдаёт карту как есть, без обёртки `{success, data}`; функции — с
 * обёрткой. Успех функции — любой 2xx: на POST шлюз отвечает 201.
 *
 * Слов предметной области в файле нет: каналом пользуется любое расширение.
 */

/** Магазин и адрес шлюза: всё, что нужно каналу. */
export interface ExtensionChannel {
  storeId: string;
  apiBase: string;
}

export interface FunctionReply {
  status: number;
  body: unknown;
}

/** Ключ токена покупателя в localStorage — тот же, что у входа темы (`lib/auth.ts`). */
const CUSTOMER_TOKEN_KEY = "merfy_customer_token";
/** Пробелы, управляющие символы и обратная косая: браузер при разборе ссылки убирает табуляцию и склеивает `/` + `\t/` в `//`. */
const UNSAFE_LINK_CHARS = /[\s\\\p{Cc}]/u;
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const escapeHtml = (raw: unknown): string =>
  String(raw ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

export const attribute = (name: string, value: string): string =>
  ` ${name}="${escapeHtml(value)}"`;

/** Свой путь сайта: `/…`, но не `//…` и без пробелов, управляющих символов и `\`. Иначе `null`. */
export function sitePath(url: unknown): string | null {
  if (typeof url !== "string" || UNSAFE_LINK_CHARS.test(url)) return null;
  return url.startsWith("/") && !url.startsWith("//") ? url : null;
}

/** Ссылка кнопки: свой путь (`/…`, но не `//…`) или `https://`. Остальное — `null`. */
export function safeLink(url: unknown): string | null {
  if (typeof url !== "string" || UNSAFE_LINK_CHARS.test(url)) return null;
  return sitePath(url) ?? (url.startsWith("https://") ? url : null);
}

/** Успех — любой 2xx: шлюз отвечает на POST статусом 201, а не 200. */
export const isSuccessStatus = (status: number): boolean =>
  status >= 200 && status < 300;

/** `data` из ответа функции `{success: true, data}`; иначе `undefined`. */
export function replyData(reply: FunctionReply | null): unknown {
  if (reply === null || !isSuccessStatus(reply.status)) return undefined;
  const body = reply.body;
  return isRecord(body) && body.success === true ? body.data : undefined;
}

function readCustomerToken(): string {
  try {
    return window.localStorage.getItem(CUSTOMER_TOKEN_KEY) ?? "";
  } catch {
    // Хранилище закрыто (приватный режим): идём как гость.
    return "";
  }
}

const readJson = (response: Response): Promise<unknown> =>
  response.json().catch(() => null);

function functionHeaders(): Record<string, string> {
  const token = readCustomerToken();
  const json = { "Content-Type": "application/json" };
  return token === "" ? json : { ...json, Authorization: `Bearer ${token}` };
}

/** Карта расширений: публичная, без кук. Сбой сети или не 2xx — `null`. */
export async function fetchStorefrontMap(
  channel: ExtensionChannel,
): Promise<unknown> {
  const url = `${channel.apiBase}/store/extensions/storefront?store_id=${encodeURIComponent(channel.storeId)}`;
  try {
    const response = await fetch(url, { credentials: "omit" });
    return response.ok ? await readJson(response) : null;
  } catch {
    // Сеть недоступна: страница работает как без расширений.
    return null;
  }
}

/** Вызов функции расширения; `null` — до сервера не дошли (сеть). */
export function callFunction(
  channel: ExtensionChannel,
  point: { extensionId: string; name: string },
  input: object,
): Promise<FunctionReply | null> {
  const tail = `fn/${encodeURIComponent(point.name)}`;
  return postToExtension(channel, point.extensionId, tail, input);
}

/**
 * POST на адрес расширения в шлюзе: `/store/extensions/:id/<tail>` — функция
 * (`fn/:name`) или загрузка файла (`files`, `files/:fileId/complete`). Токен
 * покупателя — заголовком, куки — с собой. `null` — до сервера не дошли (сеть).
 */
export async function postToExtension(
  channel: ExtensionChannel,
  extensionId: string,
  tail: string,
  input: object,
): Promise<FunctionReply | null> {
  const path = `${encodeURIComponent(extensionId)}/${tail}`;
  const url = `${channel.apiBase}/store/extensions/${path}?store_id=${encodeURIComponent(channel.storeId)}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: functionHeaders(),
      credentials: "include",
      body: JSON.stringify(input),
    });
    return { status: response.status, body: await readJson(response) };
  } catch {
    // Сеть недоступна: вызывающий решает — молчать (показ) или сказать покупателю (отправка).
    return null;
  }
}
