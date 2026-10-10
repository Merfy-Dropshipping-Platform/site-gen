import type { SectionRegistry } from './registry';

// Чей сбой (design.md блока 7, С7-16 А). Ошибка после запуска — в обработчике клика, таймере, обещании — приходит на
// window событием error или unhandledrejection. Виновника ищем по адресу файла: у события error он в filename, у
// отклонённого обещания — в стеке ошибки. Адрес — без query: повторная загрузка (?merfy-retry=1) — тот же модуль.
// Чужие ошибки (тема, сторонние скрипты) ядро не трогает.
export interface SourceIndex {
  add: (src: string, name: string) => void;
  nameOfFile: (file: string) => string | undefined;
  nameInStack: (stack: string) => string | undefined;
}

function fileOf(src: string, base: string): string | undefined {
  if (!URL.canParse(src, base)) return undefined;
  const url = new URL(src, base);
  return `${url.origin}${url.pathname}`;
}

export function sourceIndex(base: string): SourceIndex {
  const files = new Map<string, string>();
  const add = (src: string, name: string): void => {
    const file = fileOf(src, base);
    if (file !== undefined) files.set(file, name);
  };
  return {
    add,
    nameOfFile: (file) => files.get(fileOf(file, base) ?? ''),
    nameInStack: (stack) => [...files].find(([file]) => stack.includes(file))?.[1],
  };
}

const stackOf = (error: unknown): string => (error instanceof Error ? (error.stack ?? '') : '');

function blame(registry: SectionRegistry, name: string | undefined, error: unknown): void {
  if (name !== undefined) registry.fail(name, 'runtime', error);
}

export function watchErrors(win: Window, sources: SourceIndex, registry: SectionRegistry, signal: AbortSignal): void {
  const nameOfError = (event: ErrorEvent): string | undefined =>
    sources.nameOfFile(event.filename) ?? sources.nameInStack(stackOf(event.error));
  win.addEventListener('error', (event) => blame(registry, nameOfError(event), event.error), { signal });
  win.addEventListener(
    'unhandledrejection',
    (event) => blame(registry, sources.nameInStack(stackOf(event.reason)), event.reason),
    { signal },
  );
}
