// Коды ошибок ядра витрины (design.md блока 7): список модулей страницы битый; такой части ядра нет; в модуле секции нет
// определения секции; ядро тяжелее бюджета (сборка, build/build.ts). Ядро секций (блок 5): атрибут писать нельзя
// (El.attr, El.cssVar); тег входных данных не разобрать; помощник ctx вызван с неверными аргументами.
export type ShellErrorCode =
  | 'modules-invalid'
  | 'part-unknown'
  | 'section-invalid'
  | 'core-too-heavy'
  | 'attr-forbidden'
  | 'input-invalid'
  | 'sdk-call-invalid';

type ErrorDetails = { path?: string; cause?: unknown };

// Одна ошибка пакета: код — для программы, путь и текст по-русски — для человека. Устроена так же, как ошибки пакетов
// блоков 3–6: текст начинается с пути.
export class ShellError extends Error {
  readonly code: ShellErrorCode;
  readonly path?: string;

  constructor(code: ShellErrorCode, text: string, details: ErrorDetails = {}) {
    super(details.path === undefined ? text : `${details.path}: ${text}`, { cause: details.cause });
    this.name = 'ShellError';
    this.code = code;
    this.path = details.path;
  }
}
