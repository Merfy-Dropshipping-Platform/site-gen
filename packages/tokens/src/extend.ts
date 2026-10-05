import { z } from 'zod';
import { entryProblems, entryShape, orderOf, readEntries, type CheckContext } from './dictionary';
import { RUSSIAN_ERRORS, TokenError, shapeProblems, throwIfProblems } from './errors';
import type { Dictionary } from './types';

// Расширение темой (design.md, раздел 7): тема дописывает свои токены той же записью, что в словаре платформы.
// Имя — с меткой theme: цвет «theme-…», остальные виды «<вид>-theme-…». Базовый токен расширением не переопределить.
export const THEME_GROUP = 'theme';
const extensionShape = z.record(z.string(), entryShape);

export function extendDictionary(base: Dictionary, extension: unknown): Dictionary {
  const parsed = extensionShape.safeParse(extension, RUSSIAN_ERRORS);
  if (!parsed.success) throw new TokenError('extension-invalid', shapeProblems(parsed.error, 'extend'));
  const names = Object.keys(parsed.data);
  const taken = names.filter((name) => name in base.tokens);
  const fresh = Object.fromEntries(Object.entries(parsed.data).filter(([name]) => !(name in base.tokens)));
  const reading = readEntries(fresh, THEME_GROUP);
  const tokens = { ...base.tokens, ...reading.tokens };
  const groupIds = base.groups.map((group) => group.id);
  const context: CheckContext = { tokens, groupIds, origin: 'extension' };
  const sorted = orderOf(tokens);
  const problems = [
    ...taken.map((name) => `${name}: такой токен уже есть в словаре платформы`),
    ...reading.problems,
    ...entryProblems(Object.keys(reading.tokens), context),
    ...sorted.cycles,
  ];
  throwIfProblems('extension-invalid', [...new Set(problems)]);
  return { v: 1, groups: base.groups, tokens, order: sorted.order };
}
