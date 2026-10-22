import type { FailureStage } from './types';

// Предохранитель экземпляра (design.md блока 5, раздел 3.7; Р5а-10): через него ядро вызывает весь код секции — mount,
// unmount, обработчики ctx.on, таймеры, ctx.watch, ctx.listen и действия разметки. Исключение и отклонённое обещание —
// сбой своего экземпляра; отдаёт то, что вернул work.
export type Guard = (stage: FailureStage, work: () => unknown) => unknown;

export function createGuard(report: (stage: FailureStage, error: unknown) => void): Guard {
  return (stage: FailureStage, work: () => unknown): unknown => {
    try {
      const outcome = work();
      if (outcome instanceof Promise) void outcome.catch((error: unknown) => report(stage, error));
      return outcome;
    } catch (error) {
      report(stage, error);
      return undefined;
    }
  };
}
