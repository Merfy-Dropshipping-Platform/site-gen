import type { ActionOptions, CoreHandle, ErrorCode, Result } from './types';

// Ошибки действий SDK (блок 9: 14б Б + В, «Решил сам» пп. 6–9; таблица «Коды ошибок»): ответ шлюза → причина → код SDK и
// текст уведомления. Договор с шлюзом (тело codedError: { success: false, code, message }) и с документацией блока 14.
// Тексты сервера покупателю не показываем — кроме refused: его пишет расширение для человека.

// Ответ шлюза: статус и тело. status 0 — ответа нет: обрыв или срок REQUEST_TIMEOUT_MS (requests.ts).
export interface Reply {
  readonly status: number;
  readonly body: unknown;
}

export type Reason =
  | 'out-of-stock'
  | 'stock-limit'
  | 'rate-limit'
  | 'unauthorized'
  | 'network'
  | 'server'
  | 'invalid'
  | 'refused';

export const REASON_CODE: Readonly<Record<Reason, ErrorCode>> = {
  'out-of-stock': 'out-of-stock',
  'stock-limit': 'limit',
  'rate-limit': 'limit',
  unauthorized: 'unauthorized',
  network: 'network',
  server: 'server',
  invalid: 'invalid',
  refused: 'refused',
};

// Что видит покупатель. invalid — ничего (ошибка в коде, текст — автору в консоль), refused — текст расширения.
export const NOTICE_TEXT: Readonly<Record<Exclude<Reason, 'invalid' | 'refused'>, string>> = {
  'out-of-stock': 'Этого товара нет в наличии',
  'stock-limit': 'Больше нет в наличии',
  'rate-limit': 'Слишком много запросов. Попробуйте через минуту',
  unauthorized: 'Войдите, чтобы продолжить',
  network: 'Нет связи с магазином. Проверьте интернет и попробуйте ещё раз',
  server: 'Не получилось. Попробуйте ещё раз через минуту',
};

// Сервер урезал количество до остатка (п. 8): не ошибка, а предупреждение.
export const partialText = (added: number): string => `Добавили ${added} шт. — больше нет в наличии`;

// Корзины с этим номером нет: SDK создаёт новую и повторяет добавление один раз (п. 5). Не причина — ветка корзины.
export const CART_MISSING_CODE = 'cart_not_found';

// Код ошибки шлюза → причина. Коды корзины — orders и шлюз (часть 9б), коды функций расширений — шлюз
// (extension-fn.controller.ts). Незнакомый код — как server (правило для автора секции, п. 7).
const SERVER_CODE_REASON: Readonly<Record<string, Reason>> = {
  out_of_stock: 'out-of-stock',
  product_not_found: 'invalid',
  invalid_input: 'invalid',
  not_found: 'invalid',
  forbidden: 'invalid',
  unauthorized: 'unauthorized',
  refused: 'refused',
  unavailable: 'server',
  fn_error: 'server',
  invalid_output: 'server',
};

// Статус без известного кода → причина; остальные статусы — server.
const STATUS_REASON: Readonly<Record<number, Reason>> = { 0: 'network', 401: 'unauthorized', 429: 'rate-limit' };

const textAt = (body: unknown, key: 'code' | 'message'): string | null => {
  if (typeof body !== 'object' || body === null) return null;
  const value: unknown = Reflect.get(body, key);
  return typeof value === 'string' && value !== '' ? value : null;
};

export const serverCodeOf = (reply: Reply): string | null => textAt(reply.body, 'code');
export const serverMessageOf = (reply: Reply): string | null => textAt(reply.body, 'message');

// Причина неудачного ответа: известный код тела → статус по таблице действия (у подписки 400 и 404 — invalid) → общий
// статус → server.
export function reasonOf(reply: Reply, byStatus: Readonly<Record<number, Reason>> = {}): Reason {
  const sources = [SERVER_CODE_REASON[serverCodeOf(reply) ?? ''], byStatus[reply.status], STATUS_REASON[reply.status]];
  return sources.find((reason) => reason !== undefined) ?? 'server';
}

export interface Failure {
  readonly code: ErrorCode;
  readonly message: string; // error.message ответа действия
  readonly notice: string | null; // текст уведомления покупателю; null — не показывать
}

// invalid — текст для автора (author); refused — текст сервера; остальные — по причине.
export function failureOf(reason: Reason, author: string, reply?: Reply): Failure {
  if (reason === 'invalid') return { code: 'invalid', message: author, notice: null };
  if (reason === 'refused') {
    const text = (reply === undefined ? null : serverMessageOf(reply)) ?? NOTICE_TEXT.server;
    return { code: 'refused', message: text, notice: text };
  }
  return { code: REASON_CODE[reason], message: NOTICE_TEXT[reason], notice: NOTICE_TEXT[reason] };
}

export const failed = <T>(failure: Failure): Result<T> => ({
  ok: false,
  error: { code: failure.code, message: failure.message },
});

// Кто видит ошибку: invalid — автор, строкой в консоли (и на витрине, и в превью); quiet — никто: секция покажет сама;
// остальное — уведомление платформы merfy:notice:show (секция «Уведомления»).
export function reportFailure(core: CoreHandle, failure: Failure, options?: ActionOptions): void {
  if (failure.code === 'invalid') console.error(failure.message);
  if (failure.notice === null || options?.quiet === true) return;
  core.emit('merfy:notice:show', { level: 'error', message: failure.notice, code: failure.code });
}

export function reportWarning(core: CoreHandle, message: string, options?: ActionOptions): void {
  if (options?.quiet === true) return;
  core.emit('merfy:notice:show', { level: 'warning', message });
}
