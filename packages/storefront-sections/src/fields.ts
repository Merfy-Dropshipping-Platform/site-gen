import { settingFieldShape, settingProblem } from '@merfy/tokens';
import { z } from 'zod';
import { MENU_ID, MENU_ID_MAX } from './menus';

// Поле настройки секции (блок 1 «Секций и SDK», часть 3, п. 4, Р52): поле настройки панели темы (settingFieldShape из
// @merfy/tokens) или поле вида richtext — HTML с форматированием, только у секций: панель темы его не знает. Значение
// richtext — строка до RICHTEXT_MAX знаков; перед рендером её очищает richtext.ts (в settings.ts).
export const RICHTEXT_MAX = 20_000;

const richtextSpecShape = z.strictObject({ kind: z.literal('richtext'), default: z.string() });
// Вид menu (часть 4, Р1-4-3): значение — id меню из ключа menus ревизии; в шаблон приходит дерево меню (menus.ts).
const menuSpecShape = z.strictObject({ kind: z.literal('menu'), default: z.string() });

export const sectionFieldShape = settingFieldShape.extend({
  setting: z.discriminatedUnion('kind', [...settingFieldShape.shape.setting.options, richtextSpecShape, menuSpecShape]),
});

export type SectionField = z.infer<typeof sectionFieldShape>;
export type SectionSettingSpec = SectionField['setting'];

// Значение настройки секции годится? Нет — текст проблемы с путём, как settingProblem у полей панели.
export function sectionSettingProblem(path: string, spec: SectionSettingSpec, value: unknown): string | undefined {
  if (spec.kind === 'menu')
    return typeof value === 'string' && value.length <= MENU_ID_MAX && MENU_ID.test(value)
      ? undefined
      : `${path}: нужен id меню: строчные латинские буквы и цифры через дефис, до ${MENU_ID_MAX} знаков`;
  if (spec.kind !== 'richtext') return settingProblem(path, spec, value);
  return typeof value === 'string' && value.length <= RICHTEXT_MAX
    ? undefined
    : `${path}: нужно HTML до ${RICHTEXT_MAX} знаков`;
}
