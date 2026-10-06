// Коды ошибок пакета (design.md блока 3, раздел 6): конфиг не прошёл проверку, тега нет на странице, версия формы
// не та; список событий пересборки не прошёл схему.
export type StorefrontConfigErrorCode = 'config-invalid' | 'config-missing' | 'config-version' | 'events-invalid';

type ErrorDetails = { path?: string; cause?: unknown };

// Одна ошибка пакета: код — для программы, путь поля и текст по-русски — для человека. Текст начинается с пути:
// «shop.url: у опубликованного магазина нужен адрес». Модуль без zod: его берёт читатель в браузере.
export class StorefrontConfigError extends Error {
  readonly code: StorefrontConfigErrorCode;
  readonly path?: string;

  constructor(code: StorefrontConfigErrorCode, text: string, details: ErrorDetails = {}) {
    super(details.path === undefined ? text : `${details.path}: ${text}`, { cause: details.cause });
    this.name = 'StorefrontConfigError';
    this.code = code;
    this.path = details.path;
  }
}
