import type { CustomCode } from '@merfy/storefront-config';
import { z } from 'zod';
import { StorefrontBuildError } from './errors';
import type { Entity } from './inputs';

// «Свой код» мерчанта для конфига страницы (блок 13 «Секций и SDK», часть 13б; «Решил сам» 5, В13-1 В): сущности
// custom-code снимка → analytics.custom, по id пикселя сборщика аналитики. Размер и пустое отсеивает сборщик витрин
// (его counters.ts); дошли сюда не той формы — ошибка входов, сборки нет.
const customCodeDataSchema = z.strictObject({ code: z.string().min(1), consent: z.enum(['required', 'none']) });

function customCodeOf(entity: Entity, index: number): CustomCode {
  const parsed = customCodeDataSchema.safeParse(entity.data);
  if (parsed.success) return { code: parsed.data.code, consent: parsed.data.consent };
  throw new StorefrontBuildError('inputs-invalid', '«свой код» не той формы: нужны код и отметка required или none', {
    path: `data.entities.${index}.data`,
  });
}

const byId = (left: Entity, right: Entity): number => (left.id < right.id ? -1 : 1);

export function customCodesOf(entities: readonly Entity[]): CustomCode[] {
  return entities
    .map((entity, index) => ({ entity, index }))
    .filter(({ entity }) => entity.type === 'custom-code')
    .sort((left, right) => byId(left.entity, right.entity))
    .map(({ entity, index }) => customCodeOf(entity, index));
}
