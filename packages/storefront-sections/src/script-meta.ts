import { ACTIONS, MODULE_NAMES, isActionName } from '@merfy/shell/actions';
import { z } from 'zod';
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
  parts: z.array(z.union([z.enum(MODULE_NAMES), z.literal(EXT_PART)])),
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

// uses — модули SDK и "ext:<id>" из section.json; parts — модули из uses и из разметки, часть ext — при "ext:<id>".
export function scriptMetaOf(manifest: SectionManifest, markup: TemplateMarkup, facts: ScriptFacts | null): ScriptMeta {
  const declared = manifest.uses ?? [];
  const modules = declared.filter(isSdkModule);
  const ext = declared.filter(isExtUse);
  const extPart = ext.length === 0 ? [] : [EXT_PART];
  return {
    uses: sorted([...modules, ...ext]),
    parts: sorted([...modules, ...markupModules(markup), ...extPart]),
    classes: [...(facts?.classes ?? [])],
  };
}
