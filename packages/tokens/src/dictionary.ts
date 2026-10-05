import { z } from 'zod';
import dictionaryData from '../dictionary.json';
import { RUSSIAN_ERRORS, TokenError, shapeProblems, throwIfProblems } from './errors';
import { KINDS, TOKEN_KINDS, isShadowValue, type KindScope, type ValueContext } from './kinds';
import type { DeriveRule, Dictionary, RuleName, TokenDef, TokenKind } from './types';

// Словарь: одна запись на токен (design.md 8.1). Форму записи проверяет zod, смысл — проверки ниже.

export const NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
export const MIN_ABOUT = 3;
export const THEME_MARK = 'theme';
const RESERVED_MARKS = [THEME_MARK, 'custom'];

const textShape = z.object({ min: z.number(), max: z.number(), leading: z.number() }).strict();
const fluidShape = z.object({ min: z.number(), max: z.number() }).strict();
const shadowShape = z
  .object({
    x: z.number(),
    y: z.number(),
    blur: z.number(),
    spread: z.number(),
    opacity: z.number(),
    color: z.string().optional(),
  })
  .strict();
export const tokenValueShape = z.union([z.string(), z.number(), textShape, fluidShape, shadowShape]);
export const deriveShape = z.discriminatedUnion('rule', [
  z.object({ rule: z.literal('alias'), from: z.string() }).strict(),
  z
    .object({ rule: z.literal('mix'), from: z.tuple([z.string(), z.string()]), weight: z.number().min(0).max(1) })
    .strict(),
  z.object({ rule: z.literal('hover'), from: z.string(), text: z.string() }).strict(),
  z.object({ rule: z.literal('contrast'), from: z.string() }).strict(),
]);
// Вид и описание — строки без ограничений: неизвестный вид и пустое описание называет код своими словами.
export const entryShape = z
  .object({
    kind: z.string(),
    about: z.string().optional(),
    group: z.string().optional(),
    derive: deriveShape.optional(),
    values: z.array(z.string()).optional(),
    default: tokenValueShape.optional(),
    on: z.array(z.string()).optional(),
  })
  .strict();
export type RawEntry = z.infer<typeof entryShape>;
export const groupShape = z.object({ id: z.string(), title: z.string() }).strict();
const dictionaryFileShape = z
  .object({
    $schema: z.string().optional(),
    v: z.literal(1),
    groups: z.array(groupShape),
    tokens: z.record(z.string(), entryShape),
  })
  .strict();

// ---- правила: откуда берут значение
const RULE_SOURCES: { [R in RuleName]: (rule: DeriveRule<R>) => string[] } = {
  alias: (rule) => [rule.from],
  mix: (rule) => [...rule.from],
  hover: (rule) => [rule.from, rule.text],
  contrast: (rule) => [rule.from],
};

export function sourcesOfRule<R extends RuleName>(rule: DeriveRule<R> | undefined): string[] {
  if (rule === undefined) return [];
  const sources = RULE_SOURCES[rule.rule];
  return sources(rule);
}

export const shadowColorOf = (def: TokenDef): string | undefined =>
  def.kind === 'shadow' && isShadowValue(def.default) ? def.default.color : undefined;

// Всё, из чего токен считается: источники правила и цвет тени.
export function usesOf(def: TokenDef): string[] {
  const color = shadowColorOf(def);
  return color === undefined ? sourcesOfRule(def.derive) : [...sourcesOfRule(def.derive), color];
}

// ---- чтение записей
type Origin = 'platform' | 'extension';
export type CheckContext = { tokens: Readonly<Record<string, TokenDef>>; groupIds: readonly string[]; origin: Origin };
type EntryCheck = (name: string, def: TokenDef, context: CheckContext) => string[];
export type EntriesReading = { tokens: Record<string, TokenDef>; problems: string[] };

const isTokenKind = (kind: string): kind is TokenKind => TOKEN_KINDS.some((known) => known === kind);

export function readEntries(raw: Readonly<Record<string, RawEntry>>, fallbackGroup: string): EntriesReading {
  const reading: EntriesReading = { tokens: {}, problems: [] };
  for (const [name, entry] of Object.entries(raw)) {
    const kind = entry.kind;
    if (!isTokenKind(kind)) reading.problems.push(`${name}: неизвестный вид «${kind}»`);
    else reading.tokens[name] = { ...entry, kind, about: entry.about ?? '', group: entry.group ?? fallbackGroup };
  }
  return reading;
}

export const markOf = (name: string, kind: TokenKind): string => name.slice(KINDS[kind].prefix.length).split('-')[0];
const isColor = (tokens: CheckContext['tokens'], name: string): boolean => {
  const def: TokenDef | undefined = tokens[name];
  return def?.kind === 'color';
};

const checkName: EntryCheck = (name) => (NAME_PATTERN.test(name) ? [] : [`${name}: имя — kebab-case латиницей`]);

const checkPrefix: EntryCheck = (name, def) => {
  const prefix = KINDS[def.kind].prefix;
  return name.startsWith(prefix) ? [] : [`${name}: у вида ${def.kind} имя начинается с ${prefix}`];
};

const OTHER_PREFIXES = TOKEN_KINDS.map((kind) => KINDS[kind].prefix).filter((prefix) => prefix !== '');
const checkColorName: EntryCheck = (name, def) => {
  const taken = def.kind === 'color' ? OTHER_PREFIXES.find((prefix) => name.startsWith(prefix)) : undefined;
  return taken === undefined ? [] : [`${name}: имя цвета не начинается с приставки другого вида (${taken})`];
};

const MARK_CHECKS: Record<Origin, (name: string, def: TokenDef) => string[]> = {
  platform: (name, def) =>
    RESERVED_MARKS.includes(markOf(name, def.kind)) ? [`${name}: слова theme и custom в словаре платформы заняты`] : [],
  extension: (name, def) =>
    markOf(name, def.kind) === THEME_MARK
      ? []
      : [`${name}: свой токен темы называется ${KINDS[def.kind].prefix}theme-…`],
};
const checkMark: EntryCheck = (name, def, context) => MARK_CHECKS[context.origin](name, def);

const checkAbout: EntryCheck = (name, def) => (def.about.trim().length >= MIN_ABOUT ? [] : [`${name}: нет описания`]);

const checkRuleKind: EntryCheck = (name, def) => {
  const rule = def.derive?.rule;
  if (rule === undefined || rule === 'alias' || def.kind === 'color') return [];
  return [`${name}: правило ${rule} — только для цветов`];
};

const checkDeriveOrDefault: EntryCheck = (name, def) =>
  def.derive !== undefined && def.default !== undefined ? [`${name}: либо derive, либо default — не оба`] : [];

// alias берёт значение того же вида; mix, hover и contrast считают из цветов.
const SOURCE_RULES: Record<RuleName, { kindOf: (def: TokenDef) => TokenKind; problem: string }> = {
  alias: { kindOf: (def) => def.kind, problem: 'другого вида' },
  mix: { kindOf: () => 'color', problem: '— не цвет' },
  hover: { kindOf: () => 'color', problem: '— не цвет' },
  contrast: { kindOf: () => 'color', problem: '— не цвет' },
};
function sourceProblems(
  name: string,
  source: string,
  kind: TokenKind,
  problem: string,
  context: CheckContext,
): string[] {
  const target: TokenDef | undefined = context.tokens[source];
  if (target === undefined) return [`${name}: источника «${source}» нет в словаре`];
  return target.kind === kind ? [] : [`${name}: «${source}» ${problem}`];
}
const checkSources: EntryCheck = (name, def, context) => {
  if (def.derive === undefined) return [];
  const rule = SOURCE_RULES[def.derive.rule];
  const sources = sourcesOfRule(def.derive);
  return sources.flatMap((source) => sourceProblems(name, source, rule.kindOf(def), rule.problem, context));
};

const checkShadowColor: EntryCheck = (name, def, context) => {
  const color = shadowColorOf(def);
  if (color === undefined || isColor(context.tokens, color)) return [];
  return [`${name}: цвет тени «${color}» — не цвет словаря`];
};

const checkOn: EntryCheck = (name, def, context) => {
  if (def.on === undefined) return [];
  if (def.kind !== 'color') return [`${name}: поле on — только у цветов`];
  const strangers = def.on.filter((background) => !isColor(context.tokens, background));
  return strangers.map((background) => `${name}: фон «${background}» — не цвет словаря`);
};

const checkValues: EntryCheck = (name, def) => {
  const values = def.values ?? [];
  if (def.kind !== 'choice') return values.length > 0 ? [`${name}: поле values — только у выбора`] : [];
  if (values.length === 0) return [`${name}: у выбора нет вариантов`];
  const wrong = values.filter((value) => !NAME_PATTERN.test(value));
  return wrong.map((value) => `${name}: вариант «${value}» — латиница в kebab-case`);
};

const checkGroup: EntryCheck = (name, def, context) =>
  context.groupIds.includes(def.group) ? [] : [`${name}: группа «${def.group}» не из списка групп`];

// Умолчание проверяется так же, как значение темы. Цвет тени здесь не смотрим — его называет checkShadowColor.
const checkDefault: EntryCheck = (name, def) => {
  if (def.default === undefined) return [];
  if (def.kind === 'scheme') return [`${name}: у схемы детали нет умолчания — без значения она как у родителя`];
  const context: ValueContext = { values: def.values ?? [], schemeIds: [] };
  const spec = KINDS[def.kind];
  return spec.schema(context).safeParse(def.default).success
    ? []
    : [`${name}: умолчание — нужно ${spec.limits(context)}`];
};

const ENTRY_CHECKS: readonly EntryCheck[] = [
  checkName,
  checkPrefix,
  checkColorName,
  checkMark,
  checkAbout,
  checkRuleKind,
  checkDeriveOrDefault,
  checkSources,
  checkShadowColor,
  checkOn,
  checkValues,
  checkGroup,
  checkDefault,
];

export function entryProblems(names: readonly string[], context: CheckContext): string[] {
  return names.flatMap((name) => ENTRY_CHECKS.flatMap((check) => check(name, context.tokens[name], context)));
}

// ---- порядок расчёта: сначала источники, потом токен. Петля — ошибка словаря.
type Walk = { order: string[]; state: Map<string, 'open' | 'done'>; cycles: string[] };

function visit(name: string, path: readonly string[], tokens: CheckContext['tokens'], walk: Walk): void {
  const def: TokenDef | undefined = tokens[name];
  if (def === undefined || walk.state.get(name) === 'done') return;
  if (walk.state.get(name) === 'open') {
    walk.cycles.push(`петля: ${[...path, name].join(' → ')}`);
    return;
  }
  walk.state.set(name, 'open');
  for (const source of sourcesOfRule(def.derive)) visit(source, [...path, name], tokens, walk);
  walk.state.set(name, 'done');
  walk.order.push(name);
}

export function orderOf(tokens: CheckContext['tokens']): { order: string[]; cycles: string[] } {
  const walk: Walk = { order: [], state: new Map(), cycles: [] };
  for (const name of Object.keys(tokens)) visit(name, [], tokens, walk);
  return { order: walk.order, cycles: walk.cycles };
}

export function parseDictionary(raw: unknown): Dictionary {
  const file = dictionaryFileShape.safeParse(raw, RUSSIAN_ERRORS);
  if (!file.success) throw new TokenError('dictionary-invalid', shapeProblems(file.error, 'dictionary'));
  const reading = readEntries(file.data.tokens, '');
  const groupIds = file.data.groups.map((group) => group.id);
  const context: CheckContext = { tokens: reading.tokens, groupIds, origin: 'platform' };
  const sorted = orderOf(reading.tokens);
  const names = Object.keys(reading.tokens);
  throwIfProblems('dictionary-invalid', [...reading.problems, ...entryProblems(names, context), ...sorted.cycles]);
  return { v: 1, groups: file.data.groups, tokens: reading.tokens, order: sorted.order };
}

// Словарь платформы: dictionary.json пакета, уже проверенный.
export const platformDictionary: Dictionary = parseDictionary(dictionaryData);

// ---- чтение словаря для остальных модулей
export const dictionaryNames = (dictionary: Dictionary): string[] => Object.keys(dictionary.tokens);

// Запись токена по имени, пришедшему снаружи (тема, правка, модель). Только свои ключи: «toString» — не токен.
export const tokenDef = (dictionary: Dictionary, name: string): TokenDef | undefined =>
  Object.hasOwn(dictionary.tokens, name) ? dictionary.tokens[name] : undefined;

// Имена одного места (корень или схема) в порядке расчёта.
export const namesIn = (dictionary: Dictionary, scope: KindScope): string[] =>
  dictionary.order.filter((name) => KINDS[dictionary.tokens[name].kind].scope === scope);

export const colorNamesOf = (dictionary: Dictionary): string[] =>
  dictionaryNames(dictionary).filter((name) => dictionary.tokens[name].kind === 'color');

// Базовый токен — без правила и умолчания: значение обязана задать тема. Схема детали без значения — как у родителя.
export const isBaseToken = (def: TokenDef): boolean =>
  def.derive === undefined && def.default === undefined && def.kind !== 'scheme';

export function valueContextOf(dictionary: Dictionary, def: TokenDef, schemeIds: readonly string[]): ValueContext {
  return { values: def.values ?? [], schemeIds, colorNames: colorNamesOf(dictionary) };
}
