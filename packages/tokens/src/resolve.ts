import { applyRule } from './derive';
import { dictionaryNames, namesIn, sourcesOfRule } from './dictionary';
import { scalarText, suffixOf, type KindScope } from './kinds';
import type { Dictionary, ResolvedTokens, Scope, ThemeTokens, TokenEdits, TokenSet, TokenValue } from './types';

// Расчёт значений по Т1-4 Б (design.md, раздел 9): правка мерчанта главнее всего; иначе значение темы, пока мерчант
// не поменял его источники; иначе правило словаря или умолчание словаря.

export const sameValue = (a: TokenValue | undefined, b: TokenValue | undefined): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

// Правки одного места: корня или схемы. Нет правок — пустой набор.
export function editsAt(edits: TokenEdits, scope: Scope): TokenSet {
  const set: TokenSet | undefined = scope === 'root' ? edits.root : edits.schemes?.[scope];
  return set ?? {};
}

function fallback(dictionary: Dictionary, name: string, values: Readonly<TokenSet>): TokenValue | undefined {
  const def = dictionary.tokens[name];
  return def.derive === undefined ? def.default : applyRule(def.derive, values);
}

// Первый проход — только тема: так видно, что тема задумала.
function resolveThemeOnly(dictionary: Dictionary, scope: KindScope, themeValues: Readonly<TokenSet>): TokenSet {
  const values: TokenSet = { ...themeValues };
  for (const name of namesIn(dictionary, scope)) {
    const value = name in values ? values[name] : fallback(dictionary, name, values);
    if (value !== undefined) values[name] = value;
  }
  return values;
}

// Второй проход — с правками. Значение темы держится, пока все источники токена такие же, как в первом проходе.
function resolveScope(
  dictionary: Dictionary,
  scope: KindScope,
  themeValues: Readonly<TokenSet>,
  edits: Readonly<TokenSet>,
): TokenSet {
  const themeOnly = resolveThemeOnly(dictionary, scope, themeValues);
  const values: TokenSet = { ...edits };
  for (const name of namesIn(dictionary, scope)) {
    if (name in values) continue;
    const sources = sourcesOfRule(dictionary.tokens[name].derive);
    const kept = name in themeValues && sources.every((source) => sameValue(values[source], themeOnly[source]));
    const value = kept ? themeValues[name] : fallback(dictionary, name, values);
    if (value !== undefined) values[name] = value;
  }
  return values;
}

// Правки только для схем темы: правка к схеме, которой в теме нет, не считается.
export function resolveTokens(dictionary: Dictionary, theme: ThemeTokens, edits: TokenEdits): ResolvedTokens {
  const schemes = Object.entries(theme.schemes).map(([id, values]): [string, TokenSet] => [
    id,
    resolveScope(dictionary, 'scheme', values, editsAt(edits, id)),
  ]);
  return {
    root: resolveScope(dictionary, 'root', theme.root, editsAt(edits, 'root')),
    schemes: Object.fromEntries(schemes),
  };
}

// Выборы — не CSS, а атрибуты на <html>: сборка ставит их, классы ловят вариантами Tailwind (design.md 8.5).
export function choiceAttributes(dictionary: Dictionary, resolved: ResolvedTokens): Record<string, string> {
  const choices = dictionaryNames(dictionary).filter((name) => dictionary.tokens[name].kind === 'choice');
  const pairs = choices
    .filter((name) => name in resolved.root)
    .map((name): [string, string] => [`data-${suffixOf(name, 'choice')}`, scalarText(resolved.root[name])]);
  return Object.fromEntries(pairs);
}
