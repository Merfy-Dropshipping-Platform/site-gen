import { z } from 'zod';
import { dictionaryNames, isBaseToken, platformDictionary, tokenDef, valueContextOf } from './dictionary';
import { RUSSIAN_ERRORS, TokenError, shapeProblems, throwIfProblems } from './errors';
import { extendDictionary } from './extend';
import { KINDS, type KindScope } from './kinds';
import type { Dictionary, ParsedTheme, ThemeTokens, TokenEdits, TokenSet, TokenValue } from './types';

// Значения темы (design.md 8.2) и правки мерчанта (8.3). Форму проверяет zod, значение — схема вида из kinds.ts:
// поэтому текст после «нужно» в ошибке тот же, что в карточке токена.

export const SCHEME_ID = /^scheme-[1-9][0-9]*$/;
const FIRST_SCHEME = 'scheme-1';
const rawSetShape = z.record(z.string(), z.unknown());
const themeShape = z
  .object({ extend: z.unknown().optional(), root: rawSetShape, schemes: z.record(z.string(), rawSetShape) })
  .strict();
const editsShape = z
  .object({ root: rawSetShape.optional(), schemes: z.record(z.string(), rawSetShape).optional() })
  .strict();

type RawSet = z.infer<typeof rawSetShape>;
// Где лежит набор: путь для текста ошибки, корень или схема, какие схемы есть у темы.
type Place = { path: string; scope: KindScope; schemeIds: readonly string[] };
type ValueReading = { ok: true; value: TokenValue } | { ok: false; problem: string };
type SetReading = { set: TokenSet; problems: string[] };
type ThemeReading = { tokens: ThemeTokens; problems: string[] };
export type EditsReading = { edits: TokenEdits; problems: string[] };

const SCOPE_PROBLEM: Record<KindScope, string> = {
  root: 'токен живёт в схеме, а не в корне',
  scheme: 'токен живёт в корне, а не в схеме',
};

function readValue(dictionary: Dictionary, place: Place, name: string, raw: unknown): ValueReading {
  const def = tokenDef(dictionary, name);
  if (def === undefined) return { ok: false, problem: `${place.path}${name}: такого токена нет в словаре темы` };
  const spec = KINDS[def.kind];
  if (spec.scope !== place.scope) return { ok: false, problem: `${place.path}${name}: ${SCOPE_PROBLEM[place.scope]}` };
  const context = valueContextOf(dictionary, def, place.schemeIds);
  const parsed = spec.schema(context).safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, problem: `${place.path}${name}: нужно ${spec.limits(context)}` };
}

function readSet(dictionary: Dictionary, place: Place, raw: RawSet): SetReading {
  const reading: SetReading = { set: {}, problems: [] };
  for (const [name, value] of Object.entries(raw)) {
    const result = readValue(dictionary, place, name, value);
    if (result.ok) reading.set[name] = result.value;
    else reading.problems.push(result.problem);
  }
  return reading;
}

// Обязательные — базовые токены места: значения без правила и умолчания задаёт только тема.
function missingProblems(dictionary: Dictionary, place: Place, raw: RawSet): string[] {
  const required = dictionaryNames(dictionary).filter((name) => {
    const def = dictionary.tokens[name];
    return isBaseToken(def) && KINDS[def.kind].scope === place.scope;
  });
  const path = place.path.slice(0, -1);
  return required.filter((name) => !(name in raw)).map((name) => `${path}: не задан ${name}`);
}

function schemeIdProblems(schemeIds: readonly string[]): string[] {
  const wrong = schemeIds.filter((id) => !SCHEME_ID.test(id));
  const problems = wrong.map((id) => `schemes.${id}: имя схемы — scheme-1, scheme-2 и так далее`);
  return schemeIds.includes(FIRST_SCHEME) ? problems : [...problems, `schemes: нет ${FIRST_SCHEME}`];
}

// scheme-1, scheme-2, … scheme-10 — по номеру: первая схема печатается и на :root.
const sortedSchemeIds = (schemes: Readonly<Record<string, RawSet>>): string[] =>
  Object.keys(schemes).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

function readThemeSets(dictionary: Dictionary, root: RawSet, schemes: Readonly<Record<string, RawSet>>): ThemeReading {
  const schemeIds = sortedSchemeIds(schemes);
  const rootPlace: Place = { path: 'root.', scope: 'root', schemeIds };
  const placeOf = (id: string): Place => ({ path: `schemes.${id}.`, scope: 'scheme', schemeIds });
  const rootReading = readSet(dictionary, rootPlace, root);
  const schemeReadings = schemeIds.map((id) => readSet(dictionary, placeOf(id), schemes[id]));
  const problems = [
    ...schemeIdProblems(schemeIds),
    ...rootReading.problems,
    ...missingProblems(dictionary, rootPlace, root),
    ...schemeIds.flatMap((id, i) => [
      ...schemeReadings[i].problems,
      ...missingProblems(dictionary, placeOf(id), schemes[id]),
    ]),
  ];
  const tokens: ThemeTokens = {
    root: rootReading.set,
    schemes: Object.fromEntries(schemeIds.map((id, i) => [id, schemeReadings[i].set])),
  };
  return { tokens, problems };
}

// theme.json → tokens: расширение даёт словарь темы, по нему проверяются значения. Все проблемы — одной ошибкой.
export function parseTheme(raw: unknown): ParsedTheme {
  const file = themeShape.safeParse(raw, RUSSIAN_ERRORS);
  if (!file.success) throw new TokenError('theme-invalid', shapeProblems(file.error, 'tokens'));
  const extension = file.data.extend;
  const dictionary = extension === undefined ? platformDictionary : extendDictionary(platformDictionary, extension);
  const reading = readThemeSets(dictionary, file.data.root, file.data.schemes);
  throwIfProblems('theme-invalid', reading.problems);
  return { dictionary, tokens: reading.tokens };
}

function readEditScheme(dictionary: Dictionary, schemeIds: readonly string[], id: string, raw: RawSet): SetReading {
  if (!schemeIds.includes(id)) return { set: {}, problems: [`schemes.${id}: такой схемы нет в теме`] };
  return readSet(dictionary, { path: `schemes.${id}.`, scope: 'scheme', schemeIds }, raw);
}

// Правки без исключения: проблемы списком. Так их читают примерка и инструмент для ИИ.
export function readTokenEdits(dictionary: Dictionary, theme: ThemeTokens, raw: unknown): EditsReading {
  const file = editsShape.safeParse(raw, RUSSIAN_ERRORS);
  if (!file.success) return { edits: {}, problems: shapeProblems(file.error, 'edits') };
  const schemeIds = Object.keys(theme.schemes);
  const root = readSet(dictionary, { path: 'root.', scope: 'root', schemeIds }, file.data.root ?? {});
  const schemeEntries = Object.entries(file.data.schemes ?? {});
  const schemes = schemeEntries.map(([id, set]) => readEditScheme(dictionary, schemeIds, id, set));
  const edits: TokenEdits = {
    root: root.set,
    schemes: Object.fromEntries(schemeEntries.map(([id], i) => [id, schemes[i].set])),
  };
  return { edits, problems: [...root.problems, ...schemes.flatMap((reading) => reading.problems)] };
}

// Правки мерчанта к теме. Имена — из словаря темы: правка к своему токену, который новая версия темы убрала, — ошибка.
export function parseTokenEdits(theme: ParsedTheme, raw: unknown): TokenEdits {
  const reading = readTokenEdits(theme.dictionary, theme.tokens, raw);
  throwIfProblems('edits-invalid', reading.problems);
  return reading.edits;
}
