import { describe, expect, it } from 'vitest';
import {
  dictionaryNames,
  entryProblems,
  isBaseToken,
  namesIn,
  parseDictionary,
  platformDictionary,
  sourcesOfRule,
  tokenDef,
  usesOf,
  type CheckContext,
} from '../src/dictionary';
import { TokenError } from '../src/errors';
import { KINDS } from '../src/kinds';
import type { TokenKind } from '../src/types';

const GROUPS = [
  { id: 'colors', title: 'Цвета' },
  { id: 'shapes', title: 'Форма' },
  { id: 'theme', title: 'Свои токены темы' },
];
const dictionaryWith = (tokens: Record<string, unknown>) => ({ v: 1, groups: GROUPS, tokens });

function problemsOf(raw: unknown): readonly string[] {
  try {
    parseDictionary(raw);
  } catch (error) {
    if (error instanceof TokenError && error.code === 'dictionary-invalid') return error.problems;
    throw error;
  }
  return [];
}

describe('словарь платформы', () => {
  it('разбирается: 78 токенов, из них 20 базовых, 13 разделов', () => {
    expect(dictionaryNames(platformDictionary)).toHaveLength(78);
    const base = dictionaryNames(platformDictionary).filter((name) => isBaseToken(platformDictionary.tokens[name]));
    expect(base).toHaveLength(20);
    expect(platformDictionary.groups).toHaveLength(13);
    expect(platformDictionary.groups[platformDictionary.groups.length - 1].id).toBe('theme');
  });

  it('по видам — как в разделе 4 design.md', () => {
    const counts: Partial<Record<TokenKind, number>> = {};
    for (const def of Object.values(platformDictionary.tokens)) counts[def.kind] = (counts[def.kind] ?? 0) + 1;
    expect(counts).toEqual({
      color: 32,
      font: 2,
      weight: 2,
      text: 9,
      tracking: 2,
      radius: 6,
      'border-width': 5,
      shadow: 6,
      spacing: 5,
      width: 2,
      choice: 4,
      scheme: 3,
    });
  });

  it('33 достраиваются правилом, 22 берут умолчание, 3 схемы деталей наследуют родителя', () => {
    const defs = Object.values(platformDictionary.tokens);
    expect(defs.filter((def) => def.derive !== undefined)).toHaveLength(33);
    expect(defs.filter((def) => def.default !== undefined)).toHaveLength(22);
    expect(defs.filter((def) => def.kind === 'scheme')).toHaveLength(3);
  });

  it('в схеме 32 цвета, в корне 46 токенов; порядок расчёта ставит источник раньше токена', () => {
    expect(namesIn(platformDictionary, 'scheme')).toHaveLength(32);
    expect(namesIn(platformDictionary, 'root')).toHaveLength(46);
    const order = platformDictionary.order;
    expect(order.indexOf('primary-hover-foreground')).toBeLessThan(order.indexOf('primary-hover'));
    expect(order.indexOf('muted-foreground')).toBeLessThan(order.indexOf('price-old'));
    expect(order.slice(0, 9)).toEqual([
      'background',
      'foreground',
      'card',
      'card-foreground',
      'popover',
      'popover-foreground',
      'primary',
      'primary-foreground',
      'primary-hover-foreground',
    ]);
  });

  it('у каждого токена раздел из списка и вид из таблицы видов', () => {
    const groupIds = platformDictionary.groups.map((group) => group.id);
    for (const def of Object.values(platformDictionary.tokens)) {
      expect(groupIds).toContain(def.group);
      expect(KINDS[def.kind]).toBeDefined();
    }
  });

  it('tokenDef отдаёт только свои записи: «toString» — не токен', () => {
    expect(tokenDef(platformDictionary, 'primary')?.kind).toBe('color');
    expect(tokenDef(platformDictionary, 'toString')).toBeUndefined();
    expect(tokenDef(platformDictionary, 'nope')).toBeUndefined();
  });

  it('источники правил и цвет тени', () => {
    expect(sourcesOfRule(platformDictionary.tokens['primary-hover'].derive)).toEqual([
      'primary',
      'primary-hover-foreground',
    ]);
    expect(sourcesOfRule(platformDictionary.tokens.border.derive)).toEqual(['foreground', 'background']);
    expect(sourcesOfRule(undefined)).toEqual([]);
    expect(
      usesOf({
        kind: 'shadow',
        about: 'Тень',
        group: 'theme',
        default: { x: 0, y: 0, blur: 1, spread: 0, opacity: 1, color: 'gold' },
      }),
    ).toEqual(['gold']);
  });
});

describe('ошибки словаря называют токен', () => {
  it.each<[string, Record<string, unknown>, string]>([
    ['нет описания', { sale: { kind: 'color', about: '', group: 'colors' } }, 'sale: нет описания'],
    [
      'источника нет',
      {
        'price-old': {
          kind: 'color',
          about: 'Старая цена',
          group: 'colors',
          derive: { rule: 'alias', from: 'muted-fg' },
        },
      },
      'price-old: источника «muted-fg» нет в словаре',
    ],
    [
      'петля',
      {
        a: { kind: 'color', about: 'Цвет а', group: 'colors', derive: { rule: 'alias', from: 'b' } },
        b: { kind: 'color', about: 'Цвет б', group: 'colors', derive: { rule: 'alias', from: 'a' } },
      },
      'петля: a → b → a',
    ],
    [
      'имя не по виду',
      { 'btn-radius': { kind: 'radius', about: 'Скругление', group: 'shapes' } },
      'btn-radius: у вида radius имя начинается с radius-',
    ],
    [
      'занятое слово custom',
      { 'custom-x': { kind: 'color', about: 'Свой цвет', group: 'colors' } },
      'custom-x: слова theme и custom в словаре платформы заняты',
    ],
    [
      'занятое слово theme',
      { 'radius-theme-x': { kind: 'radius', about: 'Скругление', group: 'shapes' } },
      'radius-theme-x: слова theme и custom в словаре платформы заняты',
    ],
    [
      'неизвестный вид',
      { x: { kind: 'gradient', about: 'Градиент', group: 'colors' } },
      'x: неизвестный вид «gradient»',
    ],
    [
      'не kebab-case',
      { Primary: { kind: 'color', about: 'Кнопка', group: 'colors' } },
      'Primary: имя — kebab-case латиницей',
    ],
    [
      'цвет с приставкой другого вида',
      { 'shadow-tint': { kind: 'color', about: 'Оттенок', group: 'colors' } },
      'shadow-tint: имя цвета не начинается с приставки другого вида (shadow-)',
    ],
    [
      'mix не у цвета',
      {
        ink: { kind: 'color', about: 'Надпись', group: 'colors' },
        paper: { kind: 'color', about: 'Бумага', group: 'colors' },
        'radius-x': {
          kind: 'radius',
          about: 'Скругление',
          group: 'shapes',
          derive: { rule: 'mix', from: ['ink', 'paper'], weight: 0.5 },
        },
      },
      'radius-x: правило mix — только для цветов',
    ],
    [
      'alias другого вида',
      {
        primary: { kind: 'color', about: 'Кнопка', group: 'colors' },
        'radius-x': {
          kind: 'radius',
          about: 'Скругление',
          group: 'shapes',
          derive: { rule: 'alias', from: 'primary' },
        },
      },
      'radius-x: «primary» другого вида',
    ],
    [
      'contrast не от цвета',
      {
        'radius-a': { kind: 'radius', about: 'Скругление', group: 'shapes', default: 4 },
        ink: { kind: 'color', about: 'Надпись', group: 'colors', derive: { rule: 'contrast', from: 'radius-a' } },
      },
      'ink: «radius-a» — не цвет',
    ],
    [
      'и правило, и умолчание',
      {
        ink: {
          kind: 'color',
          about: 'Надпись',
          group: 'colors',
          default: '#000000',
          derive: { rule: 'alias', from: 'ink-base' },
        },
        'ink-base': { kind: 'color', about: 'Основа', group: 'colors' },
      },
      'ink: либо derive, либо default — не оба',
    ],
    [
      'on не у цвета',
      { 'radius-x': { kind: 'radius', about: 'Скругление', group: 'shapes', on: ['a'] } },
      'radius-x: поле on — только у цветов',
    ],
    [
      'on на не цвет',
      { ink: { kind: 'color', about: 'Надпись', group: 'colors', on: ['paper'] } },
      'ink: фон «paper» — не цвет словаря',
    ],
    [
      'выбор без вариантов',
      { 'choice-x': { kind: 'choice', about: 'Выбор', group: 'shapes' } },
      'choice-x: у выбора нет вариантов',
    ],
    [
      'вариант не kebab-case',
      { 'choice-x': { kind: 'choice', about: 'Выбор', group: 'shapes', values: ['On'] } },
      'choice-x: вариант «On» — латиница в kebab-case',
    ],
    [
      'values не у выбора',
      { 'radius-x': { kind: 'radius', about: 'Скругление', group: 'shapes', values: ['a'] } },
      'radius-x: поле values — только у выбора',
    ],
    [
      'раздел не из списка',
      { ink: { kind: 'color', about: 'Надпись', group: 'nope' } },
      'ink: группа «nope» не из списка групп',
    ],
    [
      'плохое умолчание',
      { 'border-width-x': { kind: 'border-width', about: 'Толщина', group: 'shapes', default: 1.5 } },
      'border-width-x: умолчание — нужно целое от 0 до 16 px',
    ],
    [
      'умолчание у схемы детали',
      { 'scheme-x': { kind: 'scheme', about: 'Схема', group: 'shapes', default: 'scheme-2' } },
      'scheme-x: у схемы детали нет умолчания — без значения она как у родителя',
    ],
    [
      'цвет тени не цвет',
      {
        'shadow-x': {
          kind: 'shadow',
          about: 'Тень',
          group: 'shapes',
          default: { x: 0, y: 0, blur: 4, spread: 0, opacity: 0.2, color: 'gold' },
        },
      },
      'shadow-x: цвет тени «gold» — не цвет словаря',
    ],
  ])('%s', (_title, tokens, problem) => {
    expect(problemsOf(dictionaryWith(tokens))).toEqual([problem]);
  });

  it('ошибка формы записи называет путь к полю', () => {
    const problems = problemsOf(
      dictionaryWith({ ink: { kind: 'color', about: 'Надпись', group: 'colors', colour: 'red' } }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^dictionary\.tokens\.ink: /);
  });

  it('бросает TokenError с кодом dictionary-invalid и всеми проблемами в тексте', () => {
    const raw = dictionaryWith({
      sale: { kind: 'color', about: '', group: 'colors' },
      x: { kind: 'gradient', about: 'Градиент' },
    });
    expect(() => parseDictionary(raw)).toThrow('x: неизвестный вид «gradient»\nsale: нет описания');
  });

  it('у записи расширения метка обязана быть theme', () => {
    const context: CheckContext = {
      tokens: {
        gold: { kind: 'color', about: 'Золото', group: 'theme' },
        'theme-gold': { kind: 'color', about: 'Золото', group: 'theme' },
      },
      groupIds: ['theme'],
      origin: 'extension',
    };
    expect(entryProblems(['gold', 'theme-gold'], context)).toEqual(['gold: свой токен темы называется theme-…']);
  });
});
