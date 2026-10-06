import { READABLE } from '../color';
import { ruleText } from '../derive';
import { dictionaryNames, tokenDef } from '../dictionary';
import { checkEdits, dependentsOf, groupsOf, limitsOf, mergeEdits, sourceOf } from '../helpers';
import { KINDS, classesOf, valueText } from '../kinds';
import { editsAt, resolveTokens } from '../resolve';
import { NOT_TOKENS, searchTokens } from '../search/tokens';
import type {
  ContrastIssue,
  EditCheck,
  ResolvedTokens,
  Scope,
  TokenChange,
  TokenEdits,
  TokenSearchResult,
  TokenState,
  TokensToolResult,
  ValueSource,
} from '../types';
import { readTokenEdits } from '../values';

// Тексты ответов инструмента (design.md 8.8): коротко, кусками, словарь целиком не отдаётся. Шесть действий.

const ROWS_SHOWN = 5;
const ISSUES_SHOWN = 3;
const SOURCE_TEXT: Record<ValueSource, string> = {
  edit: 'правка',
  theme: 'тема',
  rule: 'правило',
  default: 'умолчание',
  unset: 'не задано',
};

// ---- строки «имя — о чём · сейчас»
const scopesOf = (state: TokenState, resolved: ResolvedTokens, name: string): Scope[] =>
  KINDS[state.dictionary.tokens[name].kind].scope === 'root' ? ['root'] : Object.keys(resolved.schemes);

function shown(state: TokenState, resolved: ResolvedTokens, scope: Scope, name: string): string {
  const value = scope === 'root' ? resolved.root[name] : resolved.schemes[scope][name];
  const text = valueText(state.dictionary.tokens[name].kind, value);
  return scope === 'root' ? text : `${scope} ${text}`;
}

const nowText = (state: TokenState, resolved: ResolvedTokens, name: string): string =>
  scopesOf(state, resolved, name)
    .map((scope) => shown(state, resolved, scope, name))
    .join(', ');

export const rowText = (state: TokenState, resolved: ResolvedTokens, name: string): string =>
  `${name} — ${state.dictionary.tokens[name].about} · ${nowText(state, resolved, name)}`;

// ---- find: до пяти строк; не токен — куда идти; незнакомое слово — честный отказ
type Hits = TokenSearchResult<'hits'>;

function notes(result: Hits): string[] {
  const quoted = (word: string): string => `«${word}»`;
  const ignored = result.ignored.filter((word) => !/\d/.test(word)).map(quoted);
  const fixed = result.corrected.map(quoted);
  // «Ещё» — только те, что совпали всеми словами: совпавшие одним словом из двух — шум.
  const more = result.hits.slice(ROWS_SHOWN).filter((hit) => hit.full).length;
  return [
    fixed.length > 0 ? `Опечатку поправил: ${fixed.join(', ')}.` : '',
    ignored.length > 0 ? `Не искал по: ${ignored.join(', ')} — таких слов в словаре нет.` : '',
    more > 0 ? `Ещё ${more} — уточните запрос или откройте раздел: list.` : '',
  ].filter((line) => line !== '');
}

function hitsText(state: TokenState, result: Hits): string {
  const resolved = resolveTokens(state.dictionary, state.theme, state.edits);
  const rows = result.hits.slice(0, ROWS_SHOWN).map((hit) => rowText(state, resolved, hit.name));
  return [...rows, ...notes(result)].join('\n');
}

function refusalText(id: string): string {
  const record = NOT_TOKENS.find((entry) => entry.id === id);
  return record === undefined ? `«${id}» — не токен.` : `«${record.title}» — не токен. ${record.refusal}`;
}

export function findAnswer(state: TokenState, query: string): string {
  const result = searchTokens(state.dictionary, query);
  if (result.kind === 'refusal') return refusalText(result.id);
  if (result.kind === 'unknown') {
    return `Слова «${result.word}» в словаре токенов нет — такое не настроить. Разделы — groups.`;
  }
  if (result.kind === 'empty') return `По «${query}» токенов нет. Разделы — groups.`;
  return hitsText(state, result);
}

// ---- describe: карточка одного токена
function nowWithSource(state: TokenState, name: string): string {
  const resolved = resolveTokens(state.dictionary, state.theme, state.edits);
  return scopesOf(state, resolved, name)
    .map((scope) => {
      const source = sourceOf(state.dictionary, state.theme, state.edits, scope, name);
      const value = shown(state, resolved, scope, name);
      return source === 'unset' ? value : `${value} (${SOURCE_TEXT[source]})`;
    })
    .join(', ');
}

const readersOf = (state: TokenState, name: string): string[] =>
  dictionaryNames(state.dictionary).filter((other) => (state.dictionary.tokens[other].on ?? []).includes(name));

export function describeAnswer(state: TokenState, name: string): string {
  const def = tokenDef(state.dictionary, name);
  if (def === undefined) return `Токена ${name} нет. Найти — find.`;
  const kind = KINDS[def.kind];
  const dependents = dependentsOf(state.dictionary, name);
  const readers = readersOf(state, name);
  const group = state.dictionary.groups.find((entry) => entry.id === def.group);
  return [
    `${name} — ${kind.label}${kind.scope === 'root' ? ', один на магазин' : ', свой в каждой схеме'}. ${def.about}.`,
    `Сейчас: ${nowWithSource(state, name)}.`,
    `Без правки: ${ruleText(state.dictionary, name)}.`,
    `Можно: ${limitsOf(state.dictionary, state.theme, name)}.`,
    dependents.length > 0 ? `Вслед пересчитаются: ${dependents.join(', ')}.` : '',
    readers.length > 0 ? `На нём пишут: ${readers.join(', ')}.` : '',
    def.on === undefined ? '' : `Должен читаться на: ${def.on.join(', ')}.`,
    `Класс: ${classesOf(name, def).join(' ')}. В панели: ${group?.title ?? def.group}.`,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

// ---- check и set: примерка и запись пачкой
type Trial = { result: EditCheck; edits: TokenEdits };

function tryEdits(state: TokenState, raw: unknown): Trial {
  const reading = readTokenEdits(state.dictionary, state.theme, raw);
  if (reading.problems.length > 0)
    return { result: { problems: reading.problems, changes: [], issues: [] }, edits: {} };
  return { result: checkEdits(state.dictionary, state.theme, state.edits, reading.edits), edits: reading.edits };
}

const isProposed = (edits: TokenEdits, change: TokenChange): boolean => change.name in editsAt(edits, change.scope);

function changeText(state: TokenState, change: TokenChange): string {
  const kind = state.dictionary.tokens[change.name].kind;
  const place = change.scope === 'root' ? '' : `${change.scope} `;
  return `${place}${change.name}: ${valueText(kind, change.from)} → ${valueText(kind, change.to)}`;
}

function followText(state: TokenState, changes: readonly TokenChange[]): string[] {
  const scopes = [...new Set(changes.map((change) => change.scope))];
  return scopes.map((scope) => {
    const here = changes.filter((change) => change.scope === scope);
    const values = here.map(
      (change) => `${change.name} ${valueText(state.dictionary.tokens[change.name].kind, change.to)}`,
    );
    return `Вслед${scope === 'root' ? '' : ` в ${scope}`} (${here.length}): ${values.join(', ')}.`;
  });
}

const issueText = (issue: ContrastIssue): string =>
  `${issue.scheme}: ${issue.text} на ${issue.on} — ${issue.ratio.toFixed(2)} из ${READABLE}`;

// Первые три пары и счёт остальных: причина обычно в первой паре, остальные — её следствия.
function issuesText(issues: readonly ContrastIssue[]): string[] {
  const lines = issues.slice(0, ISSUES_SHOWN).map(issueText);
  const rest = issues.length - lines.length;
  return rest > 0 ? [...lines, `и ещё ${rest}`] : lines;
}

export function checkAnswer(state: TokenState, raw: unknown): string {
  const { result, edits } = tryEdits(state, raw);
  if (result.problems.length > 0) return ['Не годится:', ...result.problems].join('\n');
  if (result.changes.length === 0) return 'Ничего не поменяется: значения те же.';
  const direct = result.changes.filter((change) => isProposed(edits, change));
  const follow = result.changes.filter((change) => !isProposed(edits, change));
  const readability =
    result.issues.length > 0 ? ['Плохо читается:', ...issuesText(result.issues)] : ['Читаемость: новых проблем нет.'];
  return [...direct.map((change) => changeText(state, change)), ...followText(state, follow), ...readability].join(
    '\n',
  );
}

// Запись пачкой. Снять правку нельзя (владелец 06.10: «нет») — её меняют новой правкой.
export function setAnswer(state: TokenState, raw: unknown): TokensToolResult {
  const { result, edits } = tryEdits(state, raw);
  if (result.problems.length > 0) return { text: ['Не записано:', ...result.problems].join('\n') };
  const direct = result.changes.filter((change) => isProposed(edits, change)).length;
  const warn = result.issues.length > 0 ? ` Плохо читается: ${issuesText(result.issues).join('; ')}.` : '';
  const text = `Записано: ${direct}, вслед пересчитано ${result.changes.length - direct}.${warn}`;
  return { text, edits: mergeEdits(state.edits, edits) };
}

// ---- groups и list: листать словарь разделами, а не целиком
export function groupsAnswer(state: TokenState): string {
  const lines = groupsOf(state.dictionary).map((group) => `${group.id} — ${group.title} · ${group.names.length}`);
  return [`Разделы (${dictionaryNames(state.dictionary).length} токенов):`, ...lines].join('\n');
}

export function listAnswer(state: TokenState, groupId: string): string {
  const group = groupsOf(state.dictionary).find((entry) => entry.id === groupId);
  if (group === undefined) return `Раздела ${groupId} нет. Разделы — groups.`;
  const resolved = resolveTokens(state.dictionary, state.theme, state.edits);
  return [`${group.title}:`, ...group.names.map((name) => rowText(state, resolved, name))].join('\n');
}
