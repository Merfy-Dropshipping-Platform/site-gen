import { compareVersions, type TokenMigrations } from '@merfy/tokens';
import { z } from 'zod';
import { versionSchema } from './inputs';
import { parseWith } from './parse';

// Журнал версий темы (design.md блока 10, «Решил сам»): changelog.json в пакете темы, версии от новой к старой. Строка —
// «вид» (look: токены, чьё умолчание меняется), «исправление» (fix) или «форма» (shape: шаг перевода из migrations.json).
// search: true — пометка «поисковикам»: версия меняет заголовки или разметку страниц. Мерчанту журнал не показываем.

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const nameSchema = z.string().regex(NAME, { error: 'нужны строчные латинские буквы, цифры и дефис' });
const textSchema = z.string().min(3);
const searchSchema = z.literal(true).optional();

const lineSchema = z.union([
  z.strictObject({ kind: z.literal('look'), text: textSchema, tokens: z.array(nameSchema), search: searchSchema }),
  z.strictObject({ kind: z.literal('fix'), text: textSchema, search: searchSchema }),
  z.strictObject({ kind: z.literal('shape'), text: textSchema, step: nameSchema, search: searchSchema }),
]);

const entrySchema = z.strictObject({
  version: versionSchema,
  date: z.string().regex(DATE, { error: 'дата — ГГГГ-ММ-ДД' }),
  lines: z.array(lineSchema).min(1),
});

const isNewestFirst = (versions: readonly { version: string }[]): boolean =>
  versions.every((entry, index) => index === 0 || compareVersions(versions[index - 1].version, entry.version) > 0);

export const changelogSchema = z.strictObject({
  $schema: z.string().optional(),
  v: z.literal(1),
  versions: z.array(entrySchema).min(1).refine(isNewestFirst, { error: 'версии — от новой к старой, без повторов' }),
});

export type Changelog = z.infer<typeof changelogSchema>;
export type ChangelogEntry = Changelog['versions'][number];

export const parseChangelog = (raw: unknown): Changelog => parseWith(changelogSchema, raw, 'changelog-invalid');

const shapeSteps = (entry: ChangelogEntry): string[] =>
  entry.lines.flatMap((line) => (line.kind === 'shape' ? [line.step] : []));

// Почему pnpm theme-version не пишет версию: нет строки журнала; «форма» ссылается на шаг, которого нет; шаг этой версии
// не объявлен строкой «форма». Пусто — можно писать.
export function changelogProblems(changelog: Changelog, migrations: TokenMigrations, version: string): string[] {
  const entry = changelog.versions.find((candidate) => candidate.version === version);
  if (entry === undefined) return [`в changelog.json нет версии ${version}: добавь строки журнала`];
  const known = new Set(migrations.steps.map((step) => step.id));
  const declared = shapeSteps(entry);
  const missing = declared.filter((id) => !known.has(id));
  const silent = migrations.steps.filter((step) => step.version === version && !declared.includes(step.id));
  return [
    ...missing.map((id) => `строка «форма» версии ${version}: шага ${id} нет в migrations.json`),
    ...silent.map((step) => `шаг ${step.id} версии ${version} не объявлен строкой «форма»`),
  ];
}

// Версии после from и до to включительно — то, что выпуск приносит магазину.
const between = (changelog: Changelog, from: string, to: string): ChangelogEntry[] =>
  changelog.versions.filter(
    (entry) => compareVersions(entry.version, from) > 0 && compareVersions(entry.version, to) <= 0,
  );

export const lookTokensBetween = (changelog: Changelog, from: string, to: string): Set<string> =>
  new Set(
    between(changelog, from, to).flatMap((entry) =>
      entry.lines.flatMap((line) => (line.kind === 'look' ? line.tokens : [])),
    ),
  );

export const searchFlaggedBetween = (changelog: Changelog, from: string, to: string): boolean =>
  between(changelog, from, to).some((entry) => entry.lines.some((line) => line.search === true));
