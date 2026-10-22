import type { Reply } from './failures';
import type { Json } from './types';

// Запрос к шлюзу (блок 9, «Решил сам» п. 4): JSON, срок REQUEST_TIMEOUT_MS, без повтора. Не бросает: обрыв и отмена по
// сроку — { status: 0, body: null }, это код network (Р9а-10), а не проглоченная ошибка.

export const REQUEST_TIMEOUT_MS = 10_000;

export interface JsonRequest {
  readonly method: 'GET' | 'POST';
  readonly body?: Json;
}

// Тело запроса и заголовки: есть body — JSON с content-type, нет — ни того ни другого.
function initOf(request: JsonRequest, signal: AbortSignal): RequestInit {
  const base: RequestInit = { method: request.method, signal };
  if (request.body === undefined) return base;
  return { ...base, headers: { 'content-type': 'application/json' }, body: JSON.stringify(request.body) };
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
