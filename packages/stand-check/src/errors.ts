import type { z } from 'zod';

// Коды ошибок инструмента стенда. По коду команда решает, что напечатать, а тест — что случилось.
export type StandErrorCode =
  | 'passport-invalid' // паспорт не прошёл схему
  | 'rules-invalid' // правила сравнения
  | 'scenario-invalid' // сценарий
  | 'routes-invalid' // таблица подмен
  | 'fixture-invalid' // данные моков
  | 'env-missing' // нет переменной окружения
  | 'args-invalid' // аргументы команды
  | 'file-unreadable' // файл не прочитан или не JSON
  | 'page-unavailable'; // страница стенда ответила не 200

export class StandError extends Error {
  readonly code: StandErrorCode;

  constructor(code: StandErrorCode, message: string, options?: ErrorOptions) {
    super(`${code}: ${message}`, options);
    this.name = 'StandError';
    this.code = code;
  }
}

// Проблемы схемы — по строке на каждую, строка называет поле: «storage.0: Invalid input…».
export function schemaProblems(error: z.ZodError): string {
  const lines = error.issues.map((issue) => `${issue.path.map(String).join('.') || '(корень)'}: ${issue.message}`);
  return lines.join('\n');
}

// Внешние данные — unknown: проверяем схемой и дальше работаем с проверенным типом (RULES.md, 3.6).
export function parseWith<T>(schema: z.ZodType<T>, raw: unknown, code: StandErrorCode, what: string): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new StandError(code, `${what}:\n${schemaProblems(result.error)}`);
  return result.data;
}
