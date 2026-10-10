// Запись о сбое секции (design.md блока 7, С7-16 А): событие merfy:section-error на window — его возьмёт журнал ошибок
// из браузера (блок 11) и отправит автору — и строка в консоли. Соседние секции сбой не трогает.
export type FailureStage = 'load' | 'define' | 'mount' | 'unmount' | 'runtime';

export interface SectionFailure {
  section: string;
  src: string;
  stage: FailureStage;
  message: string;
}

export const SECTION_ERROR_EVENT = 'merfy:section-error';

export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function reportFailure(target: EventTarget, failure: SectionFailure): void {
  target.dispatchEvent(new CustomEvent<SectionFailure>(SECTION_ERROR_EVENT, { detail: failure }));
  console.error(`Секция ${failure.section} не ожила (${failure.stage}): ${failure.message}`);
}
