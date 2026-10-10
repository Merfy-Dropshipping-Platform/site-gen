import { contrastIssues } from './contrast';
import { dictionaryNames, isBaseToken, usesOf, valueContextOf } from './dictionary';
import { KINDS, type KindScope } from './kinds';
import { editsAt, resolveTokens, sameValue } from './resolve';
import type {
  ContrastIssue,
  Dictionary,
  EditCheck,
  ResolvedTokens,
  Scope,
  SearchEntry,
  ThemeTokens,
  TokenChange,
  TokenEdits,
  TokenGroup,
  TokenSet,
  TokenValue,
  ValueSource,
} from './types';
import { readTokenEdits } from './values';

// Помощники для панели и инструмента (design.md 8.8 и 9): отвечают кусками, словарь целиком не отдают.

// Разделы, как в панели: id, название, имена, обязательные для темы. Пустые разделы не отдаются.
export function groupsOf(dictionary: Dictionary): TokenGroup[] {
  const names = dictionaryNames(dictionary);
  return dictionary.groups
    .map((group) => {
      const own = names.filter((name) => dictionary.tokens[name].group === group.id);
      const required = own.filter((name) => isBaseToken(dictionary.tokens[name]));
      return { id: group.id, title: group.title, names: own, required };
    })
    .filter((group) => group.names.length > 0);
}

// Записи для поиска: имя через «_», как у операций MCP; в описании — about и вид словами («цвет», «тень»).
export const searchCatalog = (dictionary: Dictionary): SearchEntry[] =>
  dictionaryNames(dictionary).map((name) => {
    const def = dictionary.tokens[name];
    const description = `${def.about} (${KINDS[def.kind].label})`;
    return { name: name.replace(/-/g, '_'), token: name, group: def.group, description };
  });

function valueAt(values: ResolvedTokens | ThemeTokens, scope: Scope, name: string): TokenValue | undefined {
  const set: TokenSet | undefined = scope === 'root' ? values.root : values.schemes[scope];
  return set?.[name];
}

// Откуда значение (Т1-4 Б): правка мерчанта, тема, правило словаря, умолчание словаря или не задано.
export function sourceOf(
  dictionary: Dictionary,
  theme: ThemeTokens,
  edits: TokenEdits,
  scope: Scope,
  name: string,
): ValueSource {
  if (name in editsAt(edits, scope)) return 'edit';
  const value = valueAt(resolveTokens(dictionary, theme, edits), scope, name);
  if (value === undefined) return 'unset';
  const themeValue = valueAt(theme, scope, name);
  if (themeValue !== undefined && sameValue(themeValue, value)) return 'theme';
  return dictionary.tokens[name].derive === undefined ? 'default' : 'rule';
}

// Что пересчитается вслед: по всей цепочке правил и цветам теней, в порядке словаря.
export function dependentsOf(dictionary: Dictionary, name: string): string[] {
  const names = dictionaryNames(dictionary);
  const reached = [name];
  for (let index = 0; index < reached.length; index += 1) {
    const source = reached[index];
    const fresh = names.filter(
      (other) => !reached.includes(other) && usesOf(dictionary.tokens[other]).includes(source),
    );
    reached.push(...fresh);
  }
  return names.filter((other) => other !== name && reached.includes(other));
}

// Что можно в значении, словами. Тот же текст стоит в ошибке после «нужно».
export function limitsOf(dictionary: Dictionary, theme: ThemeTokens, name: string): string {
  const def = dictionary.tokens[name];
  return KINDS[def.kind].limits(valueContextOf(dictionary, def, Object.keys(theme.schemes)));
}

// Записать пачкой (П-4 Г): новые правки поверх прежних, по месту.
export function mergeEdits(current: TokenEdits, proposed: TokenEdits): TokenEdits {
  const ids = [...new Set([...Object.keys(current.schemes ?? {}), ...Object.keys(proposed.schemes ?? {})])];
  const merged = (scope: Scope): TokenSet => ({ ...editsAt(current, scope), ...editsAt(proposed, scope) });
  return { root: merged('root'), schemes: Object.fromEntries(ids.map((id): [string, TokenSet] => [id, merged(id)])) };
}

const notEmpty = ([, set]: [string, TokenSet]): boolean => Object.keys(set).length > 0;

// Правки без пустых наборов (design.md блока 8, П-2 Б): в ревизию — только изменённое, без "root": {} и пустых схем.
export function compactEdits(edits: TokenEdits): TokenEdits {
  const schemes = Object.entries(edits.schemes ?? {}).filter(notEmpty);
  const root = editsAt(edits, 'root');
  return {
    ...(Object.keys(root).length > 0 ? { root } : {}),
    ...(schemes.length > 0 ? { schemes: Object.fromEntries(schemes) } : {}),
  };
}

const namesOfScope = (dictionary: Dictionary, scope: KindScope): string[] =>
  dictionaryNames(dictionary).filter((name) => KINDS[dictionary.tokens[name].kind].scope === scope);

function changesIn(scope: Scope, names: readonly string[], before: Readonly<TokenSet>, after: Readonly<TokenSet>) {
  return names
    .filter((name) => !sameValue(before[name], after[name]))
    .map((name): TokenChange => ({ scope, name, from: before[name], to: after[name] }));
}

function changesBetween(dictionary: Dictionary, before: ResolvedTokens, after: ResolvedTokens): TokenChange[] {
  const schemeNames = namesOfScope(dictionary, 'scheme');
  const schemeChanges = Object.keys(after.schemes).flatMap((id) =>
    changesIn(id, schemeNames, before.schemes[id], after.schemes[id]),
  );
  return [...changesIn('root', namesOfScope(dictionary, 'root'), before.root, after.root), ...schemeChanges];
}

const issueKey = (issue: ContrastIssue): string => `${issue.scheme} ${issue.text} ${issue.on}`;

// Примерка без записи: ошибки по полям; что поменяется вместе с пересчётом по Т1-4 Б; только новые проблемы
// читаемости. Если есть ошибки, изменений не считает.
export function checkEdits(
  dictionary: Dictionary,
  theme: ThemeTokens,
  current: TokenEdits,
  proposed: TokenEdits,
): EditCheck {
  const reading = readTokenEdits(dictionary, theme, proposed);
  if (reading.problems.length > 0) return { problems: reading.problems, changes: [], issues: [] };
  const before = resolveTokens(dictionary, theme, current);
  const after = resolveTokens(dictionary, theme, mergeEdits(current, reading.edits));
  const known = new Set(contrastIssues(dictionary, before).map(issueKey));
  const issues = contrastIssues(dictionary, after).filter((issue) => !known.has(issueKey(issue)));
  return { problems: [], changes: changesBetween(dictionary, before, after), issues };
}
