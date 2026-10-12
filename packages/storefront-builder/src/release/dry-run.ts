import { isDeepStrictEqual } from 'node:util';
import { lookTokensBetween, type Changelog } from '@merfy/storefront-build';
import {
  compareVersions,
  dependentsOf,
  migrateTokenEdits,
  parseTokenEdits,
  resolveTokens,
  tokenAfter,
  type Dictionary,
  type ParsedTheme,
  type ResolvedTokens,
  type TokenMigrations,
  type TokenSet,
} from '@merfy/tokens';
import { errorText } from '../errors';

// Сухой прогон выпуска темы (design.md блока 10, «Решил сам»): для каждого магазина темы на контуре — перевод правок и
// токены старой и новой версии, без рисования страниц. Отличие вне токенов, объявленных строкой «вид», и вне токенов,
// которые из них выводятся по правилам словаря, или правка, которую не прочитать, — выпуск не стартует (решение
// владельца 11.10, П10-6: автор пишет в «вид» только то, что менял сам). Правило двух выпусков: версия «с» уже знает
// новое имя каждого переименования, иначе откат на неё потерял бы правку под новым именем.

export interface VersionFiles {
  version: string;
  theme: ParsedTheme;
  migrations: TokenMigrations;
  changelog: Changelog;
}

export interface ShopEdits {
  siteId: string;
  tokens: unknown;
}

export interface ShopDryRun {
  siteId: string;
  problems: string[];
  declared: string[];
}

export interface DryRun {
  from: string;
  to: string;
  problems: string[];
  shops: ShopDryRun[];
  red: boolean;
}

interface Change {
  name: string;
  text: string;
}

interface Pair {
  from: VersionFiles;
  to: VersionFiles;
  between: TokenMigrations;
  look: ReadonlySet<string>;
}

// Объявленные токены и всё, что из них выводится по правилам словаря новой версии, цепочкой: серый текст считается из
// текста и фона, наведение и надпись кнопки — из цвета кнопки. Имя, которого нет в словаре, производных не даёт.
const withDerived = (dictionary: Dictionary, named: ReadonlySet<string>): ReadonlySet<string> =>
  new Set([...named].flatMap((name) => [name, ...dependentsOf(dictionary, name)]));

// Шаги перевода, которые приносит выпуск: после «с» и до «на» включительно.
function stepsBetween(from: VersionFiles, to: VersionFiles): TokenMigrations {
  const inRange = (version: string): boolean =>
    compareVersions(version, from.version) > 0 && compareVersions(version, to.version) <= 0;
  return { v: 1, steps: to.migrations.steps.filter((step) => inRange(step.version)) };
}

const twoReleaseProblems = (from: VersionFiles, between: TokenMigrations): string[] =>
  between.steps.flatMap((step) =>
    step.kind === 'rename' && !Object.hasOwn(from.theme.dictionary.tokens, step.to)
      ? [`шаг ${step.id}: версия ${from.version} не знает имя ${step.to} — переименование идёт в два выпуска`]
      : [],
  );

// Токены магазина в версии: её шаги перевода, её разбор правок. Не прочитать — текст вместо токенов.
function resolvedOf(files: VersionFiles, raw: unknown): ResolvedTokens | string {
  try {
    const edits = parseTokenEdits(files.theme, migrateTokenEdits(raw, files.migrations));
    return resolveTokens(files.theme.dictionary, files.theme.tokens, edits);
  } catch (error) {
    return `правки не читаются версией ${files.version}: ${errorText(error)}`;
  }
}

// Имена старой версии — в именах новой; у убранного шагом токена пары нет. Имя, которое новая версия ещё знает, остаётся
// как есть: переименование идёт в два выпуска, а токен платформы из словаря не уходит вовсе — шаг переносит только
// правку мерчанта, и у старого имени видно умолчание темы.
const renamed = (set: TokenSet, between: TokenMigrations, known: Dictionary): TokenSet =>
  Object.fromEntries(
    Object.entries(set).flatMap(([name, value]) => {
      const next = Object.hasOwn(known.tokens, name) ? name : tokenAfter(name, between);
      return next === null ? [] : [[next, value] as const];
    }),
  );

function changedIn(scope: string, before: TokenSet, after: TokenSet): Change[] {
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return names
    .filter((name) => !isDeepStrictEqual(before[name], after[name]))
    .map((name) => ({
      name,
      text: `${scope}.${name}: ${JSON.stringify(before[name])} → ${JSON.stringify(after[name])}`,
    }));
}

// root и схемы, которые есть в обеих версиях: новую схему магазин ещё не выбрал.
function changesOf(before: ResolvedTokens, after: ResolvedTokens, pair: Pair): Change[] {
  const old = (set: TokenSet): TokenSet => renamed(set, pair.between, pair.to.theme.dictionary);
  const shared = Object.keys(after.schemes).filter((id) => Object.hasOwn(before.schemes, id));
  return [
    ...changedIn('root', old(before.root), after.root),
    ...shared.flatMap((id) => changedIn(id, old(before.schemes[id]), after.schemes[id])),
  ];
}

function shopDryRun(pair: Pair, shop: ShopEdits): ShopDryRun {
  const before = resolvedOf(pair.from, shop.tokens);
  const after = resolvedOf(pair.to, shop.tokens);
  if (typeof before === 'string' || typeof after === 'string') {
    const problems = [before, after].filter((value): value is string => typeof value === 'string');
    return { siteId: shop.siteId, problems, declared: [] };
  }
  const changes = changesOf(before, after, pair);
  const undeclared = changes.filter((change) => !pair.look.has(change.name));
  const problems = undeclared.map((change) => `${change.text} — строки «вид» нет`);
  const declared = changes.filter((change) => pair.look.has(change.name)).map((change) => change.text);
  return { siteId: shop.siteId, problems, declared };
}

export function dryRun(from: VersionFiles, to: VersionFiles, shops: readonly ShopEdits[]): DryRun {
  const between = stepsBetween(from, to);
  const named = lookTokensBetween(to.changelog, from.version, to.version);
  const pair = { from, to, between, look: withDerived(to.theme.dictionary, named) };
  const problems = twoReleaseProblems(from, between);
  const results = shops.map((shop) => shopDryRun(pair, shop));
  const red = problems.length > 0 || results.some((shop) => shop.problems.length > 0);
  return { from: from.version, to: to.version, problems, shops: results, red };
}
