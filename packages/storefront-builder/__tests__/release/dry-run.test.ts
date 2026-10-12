import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseChangelog, type Changelog } from '@merfy/storefront-build';
import { parseTheme, type TokenMigrations } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { dryRun, type VersionFiles } from '../../src/release/dry-run';

// Токены настоящей темы nova. Основные тесты меняют толщину основного текста: «новая версия» отдаёт ей значение
// толщины заголовков — токен корня без производных, словарь значение примет. Тесты производных (решение владельца
// 11.10, П10-6) меняют фон первой схемы: от него считаются карточки, границы и серый текст (блок 9), и вместе с фоном
// меняется ещё одиннадцать значений.
const THEME_FILE = fileURLToPath(new URL('../../../theme-nova/theme.json', import.meta.url));
const tokenSet = z.object({
  root: z.record(z.string(), z.unknown()),
  schemes: z.record(z.string(), z.record(z.string(), z.unknown())),
});
const nova = z.object({ tokens: tokenSet }).parse(JSON.parse(await readFile(THEME_FILE, 'utf8'))).tokens;
const token = 'weight-body';
const donor = 'weight-heading';
if (isDeepStrictEqual(nova.root[token], nova.root[donor])) throw new Error(`у ${token} и ${donor} одно значение`);
const changed = { ...nova, root: { ...nova.root, [token]: nova.root[donor] } };
const scheme = Object.keys(nova.schemes)[0];
const surface = 'background';
const lighter = '#fafafa';
if (isDeepStrictEqual(nova.schemes[scheme][surface], lighter)) throw new Error(`у ${scheme}.${surface} уже ${lighter}`);
const recolored = { ...nova, schemes: { ...nova.schemes, [scheme]: { ...nova.schemes[scheme], [surface]: lighter } } };

const NONE: TokenMigrations = { v: 1, steps: [] };
const logWith = (line: unknown): Changelog =>
  parseChangelog({
    v: 1,
    versions: [
      { version: '0.2.0', date: '2026-10-12', lines: [line] },
      { version: '0.1.0', date: '2026-10-09', lines: [{ kind: 'fix', text: 'Первая версия' }] },
    ],
  });
const LOOK = logWith({ kind: 'look', text: 'Основной текст жирнее', tokens: [token] });
const FIX = logWith({ kind: 'fix', text: 'Исправили отступ' });
const LOOK_SURFACE = logWith({ kind: 'look', text: 'Фон светлее', tokens: [surface] });
const LOOK_TEXT = logWith({ kind: 'look', text: 'Текст темнее', tokens: ['foreground'] });
const files = (version: string, tokens: unknown, changelog: Changelog, migrations = NONE): VersionFiles => ({
  version,
  theme: parseTheme(tokens),
  migrations,
  changelog,
});
const FROM = files('0.1.0', nova, LOOK);
const TO = files('0.2.0', changed, LOOK);
const rename = (to: string): TokenMigrations => ({
  v: 1,
  steps: [{ id: 'rename-1', version: '0.2.0', kind: 'rename', from: token, to }],
});
// Что на деле меняется в nova вместе с фоном первой схемы (по прогону): карточки, границы, серые тексты.
const DERIVED_OF_SURFACE = [
  'card',
  'popover',
  'secondary',
  'secondary-hover',
  'secondary-border',
  'muted',
  'muted-foreground',
  'accent',
  'border',
  'input',
  'price-old',
];
const withScheme = (names: string[]): string[] => names.map((name) => `${scheme}.${name}`).sort();
const namesOf = (lines: string[]): string[] => lines.map((line) => line.split(': ')[0]).sort();

describe('сухой прогон выпуска (design.md блока 10)', () => {
  it('магазин без правок: меняется только токен из строки «вид»', () => {
    const result = dryRun(FROM, TO, [{ siteId: 'plain', tokens: {} }]);
    expect(result.red).toBe(false);
    expect(result.shops[0].problems).toEqual([]);
    expect(result.shops[0].declared).toHaveLength(1);
    expect(result.shops[0].declared[0].startsWith(`root.${token}: `)).toBe(true);
  });

  it('правка мерчанта главнее: её значение не меняется', () => {
    const edits = { root: { [token]: nova.root[token] } };
    const result = dryRun(FROM, TO, [{ siteId: 'edited', tokens: edits }]);
    expect(result.shops[0]).toEqual({ siteId: 'edited', problems: [], declared: [] });
  });

  it('отличие без строки «вид» — красный, в отчёте магазин и токен', () => {
    const result = dryRun(FROM, files('0.2.0', changed, FIX), [{ siteId: 'plain', tokens: {} }]);
    expect(result.red).toBe(true);
    expect(result.shops[0].problems).toHaveLength(1);
    expect(result.shops[0].problems[0]).toContain(`root.${token}: `);
    expect(result.shops[0].problems[0]).toContain('строки «вид» нет');
  });

  it('правки не читаются — красный', () => {
    const result = dryRun(FROM, TO, [{ siteId: 'broken', tokens: 'круглые' }]);
    expect(result.red).toBe(true);
    expect(result.shops[0].problems[0]).toMatch(/^правки не читаются версией 0\.1\.0/);
  });

  it('переименование в имя, которого версия «с» не знает, — красный: два выпуска', () => {
    const result = dryRun(FROM, files('0.2.0', changed, LOOK, rename('renamed-token')), []);
    expect(result.red).toBe(true);
    expect(result.problems).toEqual([
      'шаг rename-1: версия 0.1.0 не знает имя renamed-token — переименование идёт в два выпуска',
    ]);
  });

  it('переименование в имя, которое версия «с» уже знает, — не красное', () => {
    expect(dryRun(FROM, files('0.2.0', changed, LOOK, rename(donor)), []).problems).toEqual([]);
  });

  // Производные (решение владельца 11.10, П10-6): автор называет только фон, остальное словарь выводит сам.
  it('«вид» называет только фон: выводимые из него токены объявлены сами', () => {
    const result = dryRun(FROM, files('0.2.0', recolored, LOOK_SURFACE), [{ siteId: 'plain', tokens: {} }]);
    expect(result.red).toBe(false);
    expect(result.shops[0].problems).toEqual([]);
    expect(namesOf(result.shops[0].declared)).toEqual(withScheme([surface, ...DERIVED_OF_SURFACE]));
  });

  it('«вид» называет другой токен: фон и его собственные производные — красные', () => {
    const result = dryRun(FROM, files('0.2.0', recolored, LOOK_TEXT), [{ siteId: 'plain', tokens: {} }]);
    expect(result.red).toBe(true);
    expect(namesOf(result.shops[0].problems)).toEqual(withScheme([surface, 'card', 'popover']));
    expect(result.shops[0].problems[0]).toContain('строки «вид» нет');
    // Остальные девять выводятся и из текста, а текст назван.
    expect(result.shops[0].declared).toHaveLength(9);
  });
});
