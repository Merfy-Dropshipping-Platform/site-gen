// Журнал сборщика (design.md блока 6, В6-5 Б): одна строка JSON на событие — её читают глазами и grep, Loki сейчас
// остановлен. Поля — плоские: buildId, shopId, step, ms, queueWaitMs и т. п.
export type LogFields = Readonly<Record<string, string | number | boolean | null>>;
export type Log = (message: string, fields?: LogFields) => void;

export const jsonLog =
  (write: (line: string) => void, clock: () => Date): Log =>
  (message, fields = {}) =>
    write(`${JSON.stringify({ at: clock().toISOString(), msg: message, ...fields })}\n`);
