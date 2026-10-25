import namesJson from '../names.json';
import notNamesJson from '../not-names.json';
import sharedJson from '../generated/shared-settings.json';
import { z } from 'zod';

// Словарь имён полей секции (блок 3 «Секций и SDK», разделы 3.1–3.2): данные в names.json и not-names.json, список
// сквозных настроек — generated/shared-settings.json, его пишет pnpm generate из панели темы (Р3.4). Форму и смысл
// данных проверяет parseNames при загрузке модуля: сломанный словарь — исключение со списком проблем.

export const SDK_KINDS = ['string', 'text', 'richtext', 'url', 'image', 'image-pair', 'select', 'radio', 'toggle',
  'range', 'alignment', 'color-scheme', 'padding', 'menu', 'product', 'collection', 'blog', 'policy', 'hint'] as const;
export type SdkKind = (typeof SDK_KINDS)[number];

export interface NameGroup { id: string; title: string }
export interface NameEntry { name: string; kinds: readonly SdkKind[]; label: string; group: string; about: string; asks: readonly string[] }
export interface Refusal { id: string; names: readonly string[]; refusal: string }
export interface SharedSettingName { id: string; label: string; group: string }
export interface NamesDictionary {
  groups: readonly NameGroup[];
  names: readonly NameEntry[]; // порядок — как в names.json
  refusals: readonly Refusal[];
  shared: readonly SharedSettingName[];
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const kebabShape = z.string().regex(KEBAB, { error: 'имя — строчные латинские буквы и цифры через одиночный дефис' });
const refusalNameShape = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:-\*)?$/, {
  error: 'имя — kebab-case или шаблон kebab-case-*',
});
const RUSSIAN_ERRORS = { error: z.locales.ru().localeError };

export const namesFileShape = z.strictObject({
  $schema: z.string().optional(),
  v: z.literal(1),
  groups: z.array(z.strictObject({ id: kebabShape, title: z.string().min(1) })).min(1),
  names: z.record(
    kebabShape,
    z.strictObject({
      kinds: z.array(z.enum(SDK_KINDS)).min(1),
      label: z.string().min(1).max(32),
      group: z.string().min(1),
      about: z.string().min(3),
      asks: z.array(z.string().min(1)).min(1),
    }),
  ),
});

export const notNamesFileShape = z.array(
  z.strictObject({ id: kebabShape, names: z.array(refusalNameShape).min(1), refusal: z.string().min(3) }),
);

export const sharedSettingsFileShape = z.array(
  z.strictObject({ id: z.string().min(1), label: z.string().min(1), group: z.string().min(1) }),
);

const FILE_OF = { names: 'names.json', notNames: 'not-names.json', shared: 'shared-settings.json' } as const;

type FileShape = readonly [file: string, shape: z.ZodType, value: unknown];

const formProblems = (files: readonly FileShape[]): string[] =>
  files.flatMap(([file, shape, value]) => {
    const parsed = shape.safeParse(value, RUSSIAN_ERRORS);
    if (parsed.success) return [];
    return parsed.error.issues.map((issue) => `${file}: ${issue.path.join('.')}: ${issue.message}`);
  });

const repeatGroupProblems = (groups: readonly NameGroup[]): string[] => {
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const group of groups) {
    if (seen.has(group.id)) problems.push(`names.json: группа ${group.id} повторяется`);
    seen.add(group.id);
  }
  return problems;
};

const unknownGroupProblems = (entries: readonly NameEntry[], groups: readonly NameGroup[]): string[] => {
  const ids = new Set(groups.map((group) => group.id));
  return entries
    .filter((entry) => !ids.has(entry.group))
    .map((entry) => `names.json: имя ${entry.name}: группы ${entry.group} нет`);
};

const dictionaryNamesProblems = (refusals: readonly Refusal[], dictionary: ReadonlySet<string>): string[] =>
  refusals
    .flatMap((refusal) => refusal.names)
    .filter((name) => dictionary.has(name))
    .map((name) => `not-names.json: ${name} — уже имя словаря`);

const doubleRefusalProblems = (refusals: readonly Refusal[]): string[] => {
  const counts = new Map<string, number>();
  for (const name of refusals.flatMap((refusal) => refusal.names)) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => `not-names.json: ${name} — в отказах дважды`);
};

const sharedNameProblems = (shared: readonly SharedSettingName[], dictionary: ReadonlySet<string>, refusals: readonly Refusal[]): string[] => {
  const refused = new Set(refusals.flatMap((refusal) => refusal.names));
  const problemOf = (item: SharedSettingName): string | null => {
    if (dictionary.has(item.id)) return `shared-settings.json: ${item.id} — уже имя словаря`;
    if (refused.has(item.id)) return `shared-settings.json: ${item.id} — уже в отказах`;
    return null;
  };
  return shared.flatMap((item) => {
    const problem = problemOf(item);
    return problem === null ? [] : [problem];
  });
};

export function parseNames(names: unknown, notNames: unknown, shared: unknown): NamesDictionary {
  const files: readonly FileShape[] = [
    [FILE_OF.names, namesFileShape, names],
    [FILE_OF.notNames, notNamesFileShape, notNames],
    [FILE_OF.shared, sharedSettingsFileShape, shared],
  ];
  const form = formProblems(files);
  if (form.length > 0) throw new Error(form.join('\n'));

  const namesValue = namesFileShape.parse(names);
  const refusals: Refusal[] = notNamesFileShape.parse(notNames);
  const sharedValue: SharedSettingName[] = sharedSettingsFileShape.parse(shared);
  const groups = namesValue.groups;
  const entries = Object.entries(namesValue.names).map(([name, entry]) => ({ name, ...entry }));
  const dictionary = new Set(entries.map((entry) => entry.name));

  const sense = [
    ...repeatGroupProblems(groups),
    ...unknownGroupProblems(entries, groups),
    ...dictionaryNamesProblems(refusals, dictionary),
    ...doubleRefusalProblems(refusals),
    ...sharedNameProblems(sharedValue, dictionary, refusals),
  ];
  if (sense.length > 0) throw new Error(sense.join('\n'));

  return { groups, names: entries, refusals, shared: sharedValue };
}

export const namesWith = (shared: unknown): NamesDictionary => parseNames(namesJson, notNamesJson, shared);

export const NAMES: NamesDictionary = namesWith(sharedJson);

export const sharedSettingHint = (item: SharedSettingName): string =>
  `настройка «Настроек темы» «${item.group} → ${item.label}»; секция её читает: \`"uses": ["theme"]\`, в шаблоне \`theme['${item.id}']\``;
