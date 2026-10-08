// Коды ошибок пакета (design.md блока 5). Хранилище ответило ошибкой; объект хранилища не прошёл свою схему; условная
// запись не прошла за все попытки — объект слишком часто меняют. В сборке нет файла, который назван в манифесте. У
// магазина нет указателя; откатывать некуда — в истории указателя нет прошлой сборки.
export type StorefrontStorageErrorCode =
  | 'store-failed'
  | 'object-invalid'
  | 'update-conflict'
  | 'build-incomplete'
  | 'pointer-missing'
  | 'rollback-impossible';

type ErrorDetails = { path?: string; cause?: unknown };

// Одна ошибка пакета: код — для программы, путь и текст по-русски — для человека. Текст начинается с пути:
// «pointers/scarf.json: указатель не формата v1». Устроена так же, как ошибка пакета блока 4.
export class StorefrontStorageError extends Error {
  readonly code: StorefrontStorageErrorCode;
  readonly path?: string;

  constructor(code: StorefrontStorageErrorCode, text: string, details: ErrorDetails = {}) {
    super(details.path === undefined ? text : `${details.path}: ${text}`, { cause: details.cause });
    this.name = 'StorefrontStorageError';
    this.code = code;
    this.path = details.path;
  }
}
