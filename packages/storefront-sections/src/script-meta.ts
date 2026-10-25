import { ACTIONS, MODULE_NAMES, isActionName } from '@merfy/shell/actions';
import { z } from 'zod';
import { EXT_POINTS, EXT_POINT_CLASSES, EXT_POINT_PARTS, isExtPoint, type ExtPointPart } from '@merfy/shell/ext-points';
import { EXT_PART, extUseSchema, isExtUse, type SectionManifest } from './format';
import type { ScriptFacts } from './script-facts';
import { SCRIPT_CLASS } from './script-names';
import type { TemplateMarkup } from './template-markup';

// Что нужно скрипту секции (design.md блока 5, раздел 3.9, «После проверки», п. 4; «Решил сам» п. 24) — столбец
// storefront_section.script_meta (drizzle/0032). uses — модули SDK для ctx из "uses" section.json; parts — части бандла
// страницы: uses и модули действий SDK в разметке (data-action="cart.add" → cart, в uses его писать не нужно, 11г А);
// classes — классы, которые скрипт ставит toggleClass('…'): CSS для них собирает сборка. Пишет приём секции; у строк до
// части 5в — NULL, у секции без скрипта и без действий SDK — пустые списки.
// "ext:<id>" (блок 9 «Секций и SDK», часть 9в; Р9в-20) — модуль расширения в uses, часть ext — в parts.
export const scriptMetaSchema = z.strictObject({
  uses: z.array(z.union([z.enum(MODULE_NAMES), extUseSchema])),
  // Части блоков расширений (блок 12 «Секций и SDK», В12-2 А) — по местам data-ext-point в шаблоне.
  parts: z.array(z.union([z.enum(MODULE_NAMES), z.literal(EXT_PART), z.enum(EXT_POINT_PARTS)])),
  classes: z.array(z.string().regex(SCRIPT_CLASS)),
});
export type ScriptMeta = z.infer<typeof scriptMetaSchema>;
export type SdkModule = (typeof MODULE_NAMES)[number];

export const isSdkModule = (value: string): value is SdkModule => MODULE_NAMES.some((name) => name === value);

const sorted = <T extends string>(values: readonly T[]): T[] => [...new Set(values)].sort();

// Модуль действия SDK в разметке: «click:cart.add» → cart; своё действие и незнакомое имя — ничего.
function markupModules(markup: TemplateMarkup): SdkModule[] {
  return markup.actions.flatMap((token) => {
    const name = token.name.split(':').at(-1) ?? '';
    return isActionName(name) ? [ACTIONS[name].module] : [];
  });
}

// Части мест data-ext-point разметки: cart и account → points, orders → records, product → purchase; незнакомое
// место (опечатка в шаблоне) — ничего. Без повторов, по алфавиту (блок 12 «Секций и SDK», В12-2 А, Р12б-13).
function markupPointParts(markup: TemplateMarkup): ExtPointPart[] {
  const parts = (markup.points ?? []).flatMap((token) => (isExtPoint(token.name) ? [EXT_POINTS[token.name]] : []));
  return [...new Set(parts)].sort();
}

// uses — модули SDK и "ext:<id>" из section.json; parts — модули из uses и из разметки, часть ext — при "ext:<id>".
export function scriptMetaOf(manifest: SectionManifest, markup: TemplateMarkup, facts: ScriptFacts | null): ScriptMeta {
  const declared = manifest.uses ?? [];
  const modules = declared.filter(isSdkModule);
  const ext = declared.filter(isExtUse);
  const extPart = ext.length === 0 ? [] : [EXT_PART];
  const pointParts = markupPointParts(markup);
  const pointClasses = pointParts.flatMap((part) => EXT_POINT_CLASSES[part]);
  return {
    uses: sorted([...modules, ...ext]),
    parts: sorted([...modules, ...markupModules(markup), ...extPart, ...pointParts]),
    classes: [...new Set([...(facts?.classes ?? []), ...pointClasses])],
  };
}
