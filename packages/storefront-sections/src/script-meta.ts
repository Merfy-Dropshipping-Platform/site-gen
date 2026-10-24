import { ACTIONS, MODULE_NAMES, isActionName } from '@merfy/shell/actions';
import { z } from 'zod';
import type { SectionManifest } from './format';
import type { ScriptFacts } from './script-facts';
import { SCRIPT_CLASS } from './script-names';
import type { TemplateMarkup } from './template-markup';

// Что нужно скрипту секции (design.md блока 5, раздел 3.9, «После проверки», п. 4; «Решил сам» п. 24) — столбец
// storefront_section.script_meta (drizzle/0032). uses — модули SDK для ctx из "uses" section.json; parts — части бандла
// страницы: uses и модули действий SDK в разметке (data-action="cart.add" → cart, в uses его писать не нужно, 11г А);
// classes — классы, которые скрипт ставит toggleClass('…'): CSS для них собирает сборка. Пишет приём секции; у строк до
// части 5в — NULL, у секции без скрипта и без действий SDK — пустые списки.
export const scriptMetaSchema = z.strictObject({
  uses: z.array(z.enum(MODULE_NAMES)),
  parts: z.array(z.enum(MODULE_NAMES)),
  classes: z.array(z.string().regex(SCRIPT_CLASS)),
});
export type ScriptMeta = z.infer<typeof scriptMetaSchema>;
export type SdkModule = ScriptMeta['uses'][number];

export const isSdkModule = (value: string): value is SdkModule => MODULE_NAMES.some((name) => name === value);

const sorted = <T extends string>(values: readonly T[]): T[] => [...new Set(values)].sort();

// Модуль действия SDK в разметке: «click:cart.add» → cart; своё действие и незнакомое имя — ничего.
function markupModules(markup: TemplateMarkup): SdkModule[] {
  return markup.actions.flatMap((token) => {
    const name = token.name.split(':').at(-1) ?? '';
    return isActionName(name) ? [ACTIONS[name].module] : [];
  });
}

export function scriptMetaOf(manifest: SectionManifest, markup: TemplateMarkup, facts: ScriptFacts | null): ScriptMeta {
  const uses = sorted((manifest.uses ?? []).filter(isSdkModule));
  return { uses, parts: sorted([...uses, ...markupModules(markup)]), classes: [...(facts?.classes ?? [])] };
}
