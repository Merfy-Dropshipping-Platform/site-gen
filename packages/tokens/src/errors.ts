import { z } from 'zod';

export type TokenErrorCode = 'dictionary-invalid' | 'extension-invalid' | 'theme-invalid' | 'edits-invalid';

// Одна ошибка пакета. В тексте — все проблемы сразу, по строке на каждую; каждая называет токен или поле.
export class TokenError extends Error {
  readonly code: TokenErrorCode;
  readonly problems: readonly string[];

  constructor(code: TokenErrorCode, problems: readonly string[]) {
    super(problems.join('\n'));
    this.name = 'TokenError';
    this.code = code;
    this.problems = problems;
  }
}

export function throwIfProblems(code: TokenErrorCode, problems: readonly string[]): void {
  if (problems.length > 0) throw new TokenError(code, problems);
}

// Тексты ошибок zod — по-русски, без глобальной настройки: пакет не меняет zod для соседей.
export const RUSSIAN_ERRORS = { error: z.locales.ru().localeError };

// Ошибка формы (не тот тип, лишнее поле) — строкой «путь: что не так».
export function shapeProblems(error: z.ZodError, root: string): string[] {
  return error.issues.map((issue) => `${[root, ...issue.path.map(String)].join('.')}: ${issue.message}`);
}
