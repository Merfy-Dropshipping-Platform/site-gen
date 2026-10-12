import { z } from 'zod';
import { RUSSIAN_ERRORS, TokenError, shapeProblems, throwIfProblems } from './errors';

// Шаги перевода правок мерчанта между версиями темы (design.md блока 10, «Решил сам»): «переименовать токен» и «убрать
// токен, причина». Шаг узнаёт свою работу по признаку — есть правка к старому имени, — а не по номеру версии: повтор
// ничего не меняет. Ревизию не переписываем: перевод — при каждом чтении правок (сборка, превью, панель).

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const nameSchema = z.string().regex(NAME, { error: 'нужны строчные латинские буквы, цифры и дефис' });
const versionSchema = z.string().regex(VERSION, { error: 'нужна версия semver: 1.2.3' });

const renameSchema = z
  .strictObject({ id: nameSchema, version: versionSchema, kind: z.literal('rename'), from: nameSchema, to: nameSchema })
  .refine((step) => step.from !== step.to, { path: ['to'], error: 'новое имя совпадает со старым' });

const removeSchema = z.strictObject({
  id: nameSchema,
  version: versionSchema,
  kind: z.literal('remove'),
  token: nameSchema,
  reason: z.string().min(3),
});

export const tokenMigrationsSchema = z.strictObject({
  $schema: z.string().optional(),
  v: z.literal(1),
  steps: z.array(z.union([renameSchema, removeSchema])),
});

export type TokenMigrations = z.infer<typeof tokenMigrationsSchema>;
export type TokenMigrationStep = TokenMigrations['steps'][number];
type RenameStep = Extract<TokenMigrationStep, { kind: 'rename' }>;
type RemoveStep = Extract<TokenMigrationStep, { kind: 'remove' }>;
type RawSet = Record<string, unknown>;

export const NO_MIGRATIONS: TokenMigrations = { v: 1, steps: [] };

const versionParts = (version: string): number[] => version.split('.').map(Number);

// Порядок версий semver числами: 0.10.0 новее 0.9.9.
export function compareVersions(a: string, b: string): number {
  const [left, right] = [versionParts(a), versionParts(b)];
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

const orderProblems = (steps: readonly TokenMigrationStep[]): string[] =>
  steps.flatMap((step, index) =>
    index > 0 && compareVersions(steps[index - 1].version, step.version) > 0
      ? [`steps.${index}: шаги — по возрастанию версий`]
      : [],
  );

const duplicateProblems = (steps: readonly TokenMigrationStep[]): string[] =>
  steps.flatMap((step, index) =>
    steps.findIndex((other) => other.id === step.id) < index ? [`steps.${index}.id: такой шаг уже есть`] : [],
  );

export function parseTokenMigrations(raw: unknown): TokenMigrations {
  const file = tokenMigrationsSchema.safeParse(raw, RUSSIAN_ERRORS);
  if (!file.success) throw new TokenError('migrations-invalid', shapeProblems(file.error, 'migrations'));
  throwIfProblems('migrations-invalid', [...orderProblems(file.data.steps), ...duplicateProblems(file.data.steps)]);
  return file.data;
}

const isRecord = (value: unknown): value is RawSet =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const without = (set: RawSet, name: string): RawSet =>
  Object.fromEntries(Object.entries(set).filter(([key]) => key !== name));

function renameIn(set: RawSet, step: RenameStep): RawSet {
  if (!Object.hasOwn(set, step.from)) return set;
  const rest = without(set, step.from);
  return Object.hasOwn(rest, step.to) ? rest : { ...rest, [step.to]: set[step.from] };
}

const removeIn = (set: RawSet, step: RemoveStep): RawSet =>
  Object.hasOwn(set, step.token) ? without(set, step.token) : set;

const applyStep = (set: RawSet, step: TokenMigrationStep): RawSet =>
  step.kind === 'rename' ? renameIn(set, step) : removeIn(set, step);

const migrateSet = (set: RawSet, steps: readonly TokenMigrationStep[]): RawSet => steps.reduce(applyStep, set);

const migrateSchemes = (schemes: RawSet, steps: readonly TokenMigrationStep[]): RawSet =>
  Object.fromEntries(Object.entries(schemes).map(([id, set]) => [id, isRecord(set) ? migrateSet(set, steps) : set]));

// Правки мерчанта (ключ tokens ревизии) → правки в форме этой версии темы. Правки не той формы — как есть: их отвергнет
// parseTokenEdits с понятным текстом.
export function migrateTokenEdits(raw: unknown, migrations: TokenMigrations): unknown {
  if (!isRecord(raw) || migrations.steps.length === 0) return raw;
  const next: RawSet = { ...raw };
  if (isRecord(raw.root)) next.root = migrateSet(raw.root, migrations.steps);
  if (isRecord(raw.schemes)) next.schemes = migrateSchemes(raw.schemes, migrations.steps);
  return next;
}

// Имя токена после всех шагов: переименовали — новое, убрали — null. Нужно сухому прогону выпуска (блок 10).
export function tokenAfter(name: string, migrations: TokenMigrations): string | null {
  const set = migrateSet({ [name]: true }, migrations.steps);
  return Object.keys(set).at(0) ?? null;
}
