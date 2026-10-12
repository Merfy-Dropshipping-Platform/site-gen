import { parseTokenMigrations } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import { changelogProblems, lookTokensBetween, parseChangelog, searchFlaggedBetween } from '../src/changelog';
import { errorOf } from './support';

const CHANGELOG = parseChangelog({
  v: 1,
  versions: [
    {
      version: '0.3.0',
      date: '2026-10-20',
      lines: [{ kind: 'shape', text: 'Скругление кнопок — общий токен', step: 'button-corner-rename' }],
    },
    {
      version: '0.2.0',
      date: '2026-10-15',
      lines: [
        { kind: 'look', text: 'Кнопки круглее', tokens: ['radius-button'] },
        { kind: 'fix', text: 'Заголовок товара — h1', search: true },
      ],
    },
    { version: '0.1.0', date: '2026-10-10', lines: [{ kind: 'look', text: 'Вид «Чистый»', tokens: [] }] },
  ],
});
const MIGRATIONS = parseTokenMigrations({
  v: 1,
  steps: [{ id: 'button-corner-rename', version: '0.3.0', kind: 'rename', from: 'button-corner', to: 'radius-button' }],
});

describe('changelog.json', () => {
  it('версии — от новой к старой: иначе ошибка changelog-invalid', () => {
    const versions = [...CHANGELOG.versions].reverse();
    expect(errorOf(() => parseChangelog({ v: 1, versions }))).toMatchObject({ code: 'changelog-invalid' });
  });

  it('строка «форма» без шага — ошибка схемы', () => {
    const lines = [{ kind: 'shape', text: 'Форма правок' }];
    const versions = [{ version: '0.4.0', date: '2026-10-21', lines }];
    expect(errorOf(() => parseChangelog({ v: 1, versions }))).toMatchObject({ code: 'changelog-invalid' });
  });

  it('версия с журналом и объявленным шагом — проблем нет', () => {
    expect(changelogProblems(CHANGELOG, MIGRATIONS, '0.3.0')).toEqual([]);
  });

  it('нет строки журнала — отказ', () => {
    expect(changelogProblems(CHANGELOG, MIGRATIONS, '0.4.0')).toEqual([
      'в changelog.json нет версии 0.4.0: добавь строки журнала',
    ]);
  });

  it('строка «форма» ссылается на шаг, которого нет, — отказ', () => {
    expect(changelogProblems(CHANGELOG, parseTokenMigrations({ v: 1, steps: [] }), '0.3.0')).toEqual([
      'строка «форма» версии 0.3.0: шага button-corner-rename нет в migrations.json',
    ]);
  });

  it('шаг версии не объявлен строкой «форма» — отказ', () => {
    const silent = parseTokenMigrations({
      v: 1,
      steps: [{ id: 'glow-remove', version: '0.2.0', kind: 'remove', token: 'glow', reason: 'убрали' }],
    });
    expect(changelogProblems(CHANGELOG, silent, '0.2.0')).toEqual([
      'шаг glow-remove версии 0.2.0 не объявлен строкой «форма»',
    ]);
  });

  it('токены строк «вид» и пометка «поисковикам» — по версиям после from и до to', () => {
    expect([...lookTokensBetween(CHANGELOG, '0.1.0', '0.3.0')]).toEqual(['radius-button']);
    expect([...lookTokensBetween(CHANGELOG, '0.2.0', '0.3.0')]).toEqual([]);
    expect(searchFlaggedBetween(CHANGELOG, '0.1.0', '0.2.0')).toBe(true);
    expect(searchFlaggedBetween(CHANGELOG, '0.2.0', '0.3.0')).toBe(false);
  });
});

describe('схемы рядом с данными', () => {
  it('generated/*.schema.json совпадают со схемами zod', async () => {
    const { readFile } = await import('node:fs/promises');
    const { RELEASE_SCHEMAS, schemaText } = await import('../scripts/release-schemas');
    for (const [file, schema] of RELEASE_SCHEMAS)
      expect(await readFile(new URL(`../generated/${file}`, import.meta.url), 'utf8')).toBe(schemaText(schema));
  });
});
