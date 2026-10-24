import type { RouteDuplicate } from '@merfy/storefront-build';
import type { Log, LogFields } from './log';

// Совпавшие адреса записей (блок 8 «Секций и SDK», часть 8б; design.md блока 8, 8.2): у записи адрес по handle заняла
// другая — строка журнала route-duplicate на запись; сборка идёт дальше.
export function logRouteDuplicates(
  log: Log,
  fields: { shopId: string; buildId: number },
  duplicates: readonly RouteDuplicate[],
): void {
  for (const duplicate of duplicates) {
    const line: LogFields = { ...fields, ...duplicate };
    log('route-duplicate', line);
  }
}
