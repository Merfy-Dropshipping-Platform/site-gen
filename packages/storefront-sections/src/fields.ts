import { settingFieldShape, settingProblem } from '@merfy/tokens';
import { z } from 'zod';

// Поле настройки секции (блок 1 «Секций и SDK», часть 3, п. 4, Р52): поле настройки панели темы (settingFieldShape из
// @merfy/tokens) или поле вида richtext — HTML с форматированием, только у секций: панель темы его не знает. Значение
// richtext — строка до RICHTEXT_MAX знаков; перед рендером её очищает richtext.ts (в settings.ts).
export const RICHTEXT_MAX = 20_000;

const richtextSpecShape = z.strictObject({ kind: z.literal('richtext'), default: z.string() });

export const sectionFieldShape = settingFieldShape.extend({
  setting: z.discriminatedUnion('kind', [...settingFieldShape.shape.setting.options, richtextSpecShape]),
});

export type SectionField = z.infer<typeof sectionFieldShape>;
export type SectionSettingSpec = SectionField['setting'];

// Значение настройки секции годится? Нет — текст проблемы с путём, как settingProblem у полей панели.
export function sectionSettingProblem(path: string, spec: SectionSettingSpec, value: unknown): string | undefined {
  if (spec.kind !== 'richtext') return settingProblem(path, spec, value);
  return typeof value === 'string' && value.length <= RICHTEXT_MAX
    ? undefined
    : `${path}: нужно HTML до ${RICHTEXT_MAX} знаков`;
}
