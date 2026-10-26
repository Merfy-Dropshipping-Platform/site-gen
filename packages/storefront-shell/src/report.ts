// Текст ошибки для журнала и консоли (design.md блока 7, С7-16 А). Событие старого каркаса merfy:section-error и
// reportFailure убраны в части 15е блока 15: сбой секции сообщает ядро (core/instance.ts, merfy:section:error).
export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
