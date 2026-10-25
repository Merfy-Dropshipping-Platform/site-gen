import type { Reply } from './failures';
import type { Json } from './types';

// Запрос к шлюзу (блок 9, «Решил сам» п. 4): JSON, срок REQUEST_TIMEOUT_MS, без повтора. Не бросает: обрыв и отмена по
// сроку — { status: 0, body: null }, это код network (Р9а-10), а не проглоченная ошибка.

export const REQUEST_TIMEOUT_MS = 10_000;

export interface JsonRequest {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly body?: Json;
  readonly token?: string; // токен покупателя (блок 10, п. 17): заголовок Authorization: Bearer
}

// Заголовки: есть body — content-type JSON, есть token — Authorization; нет ни того ни другого — null.
function headersOf(request: JsonRequest): Record<string, string> | null {
  const headers: Record<string, string> = {};
  if (request.body !== undefined) headers['content-type'] = 'application/json';
  if (request.token !== undefined) headers.authorization = `Bearer ${request.token}`;
  return Object.keys(headers).length === 0 ? null : headers;
}

// Тело запроса и заголовки: body — JSON; заголовков нет — их нет и в запросе.
function initOf(request: JsonRequest, signal: AbortSignal): RequestInit {
  const headers = headersOf(request);
  const base: RequestInit = headers === null ? { method: request.method, signal } : { method: request.method, signal, headers };
  return request.body === undefined ? base : { ...base, body: JSON.stringify(request.body) };
}

// Тело ответа: текст — JSON; не JSON (SyntaxError) — null.
async function bodyOf(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function requestJson(url: string, init: JsonRequest): Promise<Reply> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, initOf(init, controller.signal));
    return { status: response.status, body: await bodyOf(response) };
  } catch {
    return { status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}
