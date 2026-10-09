// Коды ошибок сборщика (design.md блока 6). Настройки из окружения не прошли схему; сообщение брокера не прошло схему;
// у магазина нет того, без чего его не собрать (адреса, темы новой архитектуры); сервис не ответил на вызов; проверка
// перед переключением не пустила сборку (блок 5); у темы нет серверной сборки рисовальщика.
export type StorefrontBuilderErrorCode =
  | 'settings-invalid'
  | 'message-invalid'
  | 'shop-invalid'
  | 'rpc-failed'
  | 'build-blocked'
  | 'renderer-missing';

type ErrorDetails = { path?: string; cause?: unknown };

// Одна ошибка пакета: код — для программы, путь и текст по-русски — для человека. Текст начинается с пути:
// «site/abc: у магазина нет адреса». Устроена так же, как ошибки пакетов блоков 4 и 5.
export class StorefrontBuilderError extends Error {
  readonly code: StorefrontBuilderErrorCode;
  readonly path?: string;

  constructor(code: StorefrontBuilderErrorCode, text: string, details: ErrorDetails = {}) {
    super(details.path === undefined ? text : `${details.path}: ${text}`, { cause: details.cause });
    this.name = 'StorefrontBuilderError';
    this.code = code;
    this.path = details.path;
  }
}

// Текст ошибки для журнала и строки сборки: у ошибок пакетов он уже с путём, у остальных — как есть.
export const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));
