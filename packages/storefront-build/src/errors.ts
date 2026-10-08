// Коды ошибок пакета (design.md блока 4). Входы и данные: вход не прошёл схему, снимок данных без признака
// «получен», одна сущность дважды. Рисовальщик: в серверной сборке нет handler, страница не нарисовалась, такой
// страницы нет, astro build упал. Тема: файлы изменились, а номер версии нет. Манифест не прошёл схему. Страница
// нарушила договор рисовальщика (SEO).
export type StorefrontBuildErrorCode =
  | 'inputs-invalid'
  | 'data-not-received'
  | 'entity-duplicate'
  | 'renderer-invalid'
  | 'render-failed'
  | 'page-unknown'
  | 'theme-build-failed'
  | 'theme-version-stale'
  | 'manifest-invalid'
  | 'seo-contract';

type ErrorDetails = { path?: string; cause?: unknown };

// Одна ошибка пакета: код — для программы, путь и текст по-русски — для человека. Текст начинается с пути:
// «data.entities.2: такая сущность уже есть». Устроена так же, как ошибка конфига блока 3.
export class StorefrontBuildError extends Error {
  readonly code: StorefrontBuildErrorCode;
  readonly path?: string;

  constructor(code: StorefrontBuildErrorCode, text: string, details: ErrorDetails = {}) {
    super(details.path === undefined ? text : `${details.path}: ${text}`, { cause: details.cause });
    this.name = 'StorefrontBuildError';
    this.code = code;
    this.path = details.path;
  }
}
