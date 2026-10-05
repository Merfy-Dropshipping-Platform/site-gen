import { z } from 'zod';
import { MIN_ABOUT, colorNamesOf, dictionaryNames, entryShape, groupShape, isBaseToken } from '../dictionary';
import { KINDS, TOKEN_KINDS, type KindScope, type ValueContext } from '../kinds';
import type { Dictionary, JsonSchema, TokenValue } from '../types';
import { SCHEME_ID } from '../values';

// JSON-схемы для редактора и для агента, который пишет тему (design.md, раздел 11). Строят их те же схемы видов,
// что проверяют значения; условия вроде «min ≤ max» в JSON-схему не попадают — их ловит parseTheme.

// Запись словаря строже, чем при разборе: вид — из списка, описание — от трёх знаков.
const strictEntryShape = entryShape.extend({ kind: z.enum(TOKEN_KINDS), about: z.string().min(MIN_ABOUT) });

function valueSchema(dictionary: Dictionary, name: string): z.ZodType<TokenValue> {
  const def = dictionary.tokens[name];
  if (def.kind === 'scheme') return z.string().regex(SCHEME_ID).describe(def.about);
  const context: ValueContext = { values: def.values ?? [], schemeIds: [], colorNames: colorNamesOf(dictionary) };
  return KINDS[def.kind].schema(context).describe(def.about);
}

// Набор корня или схемы: базовые токены обязательны, остальные — по желанию темы.
function setSchema(dictionary: Dictionary, scope: KindScope) {
  const names = dictionaryNames(dictionary).filter((name) => KINDS[dictionary.tokens[name].kind].scope === scope);
  const fields = names.map((name): [string, z.ZodType<TokenValue | undefined>] => {
    const value = valueSchema(dictionary, name);
    return [name, isBaseToken(dictionary.tokens[name]) ? value : value.optional()];
  });
  return z.object(Object.fromEntries(fields)).strict();
}

const toJson = (schema: z.ZodType): JsonSchema => ({ ...z.toJSONSchema(schema) });

// theme.json → tokens по словарю темы: свои токены, корень и схемы scheme-1, scheme-2…
export function themeTokensJsonSchema(dictionary: Dictionary): JsonSchema {
  const schema = z
    .object({
      extend: z.record(z.string(), strictEntryShape.extend({ group: z.string().optional() })).optional(),
      root: setSchema(dictionary, 'root'),
      schemes: z.record(z.string().regex(SCHEME_ID), setSchema(dictionary, 'scheme')),
    })
    .strict();
  return toJson(schema);
}

// dictionary.json пакета.
export function dictionaryJsonSchema(): JsonSchema {
  const schema = z
    .object({
      $schema: z.string().optional(),
      v: z.literal(1),
      groups: z.array(groupShape),
      tokens: z.record(z.string(), strictEntryShape.extend({ group: z.string() })),
    })
    .strict();
  return toJson(schema);
}
