import { describe, expect, it } from 'vitest';
import { TokenError } from '../src/errors';
import {
  NO_MIGRATIONS,
  compareVersions,
  migrateTokenEdits,
  parseTokenMigrations,
  tokenAfter,
  type TokenMigrations,
} from '../src/migrations';

const FILE = {
  v: 1,
  steps: [
    { id: 'button-corner-rename', version: '0.2.0', kind: 'rename', from: 'button-corner', to: 'radius-button' },
    { id: 'glow-remove', version: '0.3.0', kind: 'remove', token: 'glow', reason: 'свечение убрали из темы' },
  ],
};
const MIGRATIONS: TokenMigrations = parseTokenMigrations(FILE);

function errorOf(work: () => unknown): unknown {
  try {
    work();
  } catch (error) {
    return error;
  }
  return null;
}

function problemsOf(raw: unknown): readonly string[] {
  const error = errorOf(() => parseTokenMigrations(raw));
  if (error instanceof TokenError) return error.problems;
  throw new Error('файл шагов прошёл схему, а не должен');
}

describe('migrations.json: схема', () => {
  it('читает файл с шагами «переименовать» и «убрать»', () => {
    expect(MIGRATIONS.steps.map((step) => step.kind)).toEqual(['rename', 'remove']);
  });

  it('старое и новое имя совпадают — ошибка с путём', () => {
    const step = { ...FILE.steps[0], to: 'button-corner' };
    expect(problemsOf({ v: 1, steps: [step] }).join('\n')).toContain('migrations.steps.0.to');
  });

  it('шаги не по возрастанию версий — ошибка', () => {
    expect(problemsOf({ v: 1, steps: [FILE.steps[1], FILE.steps[0]] })).toEqual([
      'steps.1: шаги — по возрастанию версий',
    ]);
  });

  it('два шага с одним id — ошибка', () => {
    const twin = { ...FILE.steps[1], id: 'button-corner-rename' };
    expect(problemsOf({ v: 1, steps: [FILE.steps[0], twin] })).toEqual(['steps.1.id: такой шаг уже есть']);
  });

  it('код ошибки — migrations-invalid', () => {
    expect(errorOf(() => parseTokenMigrations({ v: 2, steps: [] }))).toMatchObject({ code: 'migrations-invalid' });
  });
});

describe('migrateTokenEdits', () => {
  it('правка к старому имени переходит к новому — в корне и в схемах', () => {
    const raw = { root: { 'button-corner': 12 }, schemes: { 'scheme-1': { 'button-corner': 8, glow: 1 } } };
    expect(migrateTokenEdits(raw, MIGRATIONS)).toEqual({
      root: { 'radius-button': 12 },
      schemes: { 'scheme-1': { 'radius-button': 8 } },
    });
  });

  it('повтор ничего не меняет', () => {
    const once = migrateTokenEdits({ root: { 'button-corner': 12, glow: 2 } }, MIGRATIONS);
    expect(migrateTokenEdits(once, MIGRATIONS)).toEqual(once);
  });

  it('есть и старое, и новое имя — остаётся новое', () => {
    const raw = { root: { 'button-corner': 12, 'radius-button': 20 } };
    expect(migrateTokenEdits(raw, MIGRATIONS)).toEqual({ root: { 'radius-button': 20 } });
  });

  it('правки не той формы и пустые шаги — как есть', () => {
    const odd = { root: 'не объект' };
    expect(migrateTokenEdits(odd, MIGRATIONS)).toEqual(odd);
    expect(migrateTokenEdits([1, 2], MIGRATIONS)).toEqual([1, 2]);
    const raw = { root: { 'button-corner': 12 } };
    expect(migrateTokenEdits(raw, NO_MIGRATIONS)).toBe(raw);
  });

  it('имя прототипа объекта не считается правкой', () => {
    const steps = {
      v: 1,
      steps: [{ id: 'odd', version: '0.2.0', kind: 'remove', token: 'constructor', reason: 'нет' }],
    };
    expect(migrateTokenEdits({ root: { 'radius-button': 1 } }, parseTokenMigrations(steps))).toEqual({
      root: { 'radius-button': 1 },
    });
  });
});

describe('tokenAfter и compareVersions', () => {
  it('имя после всех шагов: переименовано, убрано, не тронуто', () => {
    expect(tokenAfter('button-corner', MIGRATIONS)).toBe('radius-button');
    expect(tokenAfter('glow', MIGRATIONS)).toBeNull();
    expect(tokenAfter('radius-card', MIGRATIONS)).toBe('radius-card');
  });

  it('версии сравниваются числами, а не строками', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('0.1.0', '0.1.1')).toBeLessThan(0);
  });
});
