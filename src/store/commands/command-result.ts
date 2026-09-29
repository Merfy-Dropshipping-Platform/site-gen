/**
 * Результат команды sites (этап 3): эффект или отказ с кодом.
 *
 * Команда не бросает на ожидаемых отказах (лимит, неизвестная тема, заморозка):
 * отказ — такое же значение, как эффект, с машинным `code` и деталями. Шлюз
 * переводит `code` в HTTP (402 для `shops_limit_reached` с `limit/current`,
 * как сегодня), клиент читает детали без разбора строк сообщения.
 */
export type CommandError = { code: string } & Record<string, unknown>;

export type CommandResult<E> =
  | { ok: true; effect: E }
  | { ok: false; error: CommandError };

export function ok<E>(effect: E): CommandResult<E> {
  return { ok: true, effect };
}

export function refused<E = never>(
  code: string,
  details: Record<string, unknown> = {},
): CommandResult<E> {
  return { ok: false, error: { code, ...details } };
}

/**
 * Форма ответа RPC: `{ success: true, data }` / `{ success: false, code,
 * message, ...детали }` — так же, как отвечают остальные паттерны `sites.*`
 * (`revisions.create` → `code: 'REVISION_CONFLICT'`), и тело отказа лимита
 * совпадает с сегодняшним 402 шлюза (`message: 'shops_limit_reached', limit, current`).
 */
export function toRpcResponse<E>(
  result: CommandResult<E>,
): Record<string, unknown> {
  if (result.ok) return { success: true, data: result.effect };
  return { success: false, message: result.error.code, ...result.error };
}
