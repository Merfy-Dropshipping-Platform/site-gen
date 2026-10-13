import { COUNTER_KINDS, isCounterNumber, type Counter } from '@merfy/storefront-config';
import { z } from 'zod';
import { StorefrontBuildError } from './errors';
import type { Entity } from './inputs';

// Счётчики мерчанта для конфига страницы (design.md блока 11, С11-4 Б): сущности counter снимка → analytics.counters.
// Порядок — по виду и номеру, одинаковая пара — один раз: порядок ответа сервиса и повтор в кабинете файлов не меняют.
// Данные не той формы отсеивает сборщик (его counters.ts); дошли сюда — ошибка входов, сборки нет.
const counterDataSchema = z
  .strictObject({ kind: z.enum(COUNTER_KINDS), number: z.string() })
  .refine((counter) => isCounterNumber(counter.kind, counter.number));

const keyOf = (counter: Counter): string => `${counter.kind}:${counter.number}`;
const byKey = (left: Counter, right: Counter): number => (keyOf(left) < keyOf(right) ? -1 : 1);

function counterOf(entity: Entity, index: number): Counter {
  const parsed = counterDataSchema.safeParse(entity.data);
  if (parsed.success) return { kind: parsed.data.kind, number: parsed.data.number };
  throw new StorefrontBuildError('inputs-invalid', 'счётчик не той формы: нужны вид и номер по правилу вида', {
    path: `data.entities.${index}.data`,
  });
}

export function countersOf(entities: readonly Entity[]): Counter[] {
  const counters = entities.flatMap((entity, index) => (entity.type === 'counter' ? [counterOf(entity, index)] : []));
  const unique = new Map(counters.map((counter): [string, Counter] => [keyOf(counter), counter]));
  return [...unique.values()].sort(byKey);
}
