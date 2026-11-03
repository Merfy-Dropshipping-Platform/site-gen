import type { NoData, Result } from '../types';

// Ответы команд поведений для скрипта секции (ctx.behavior, 03.11): как у действий SDK — Result, не бросает. refused —
// поведение не может сделать это сейчас (нет такого пункта, второе модальное окно, секция снята); invalid — ошибка в
// вызове, текст для автора уходит строкой в консоль.
export const done = (): Result<NoData> => ({ ok: true, data: {} });

export const refuse = (message: string): Result<NoData> => ({ ok: false, error: { code: 'refused', message } });

export function invalid(message: string): Result<NoData> {
  console.error(message);
  return { ok: false, error: { code: 'invalid', message } };
}
