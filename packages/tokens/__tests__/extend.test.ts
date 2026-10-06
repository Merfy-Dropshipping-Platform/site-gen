import { describe, expect, it } from 'vitest';
import { dictionaryNames, platformDictionary } from '../src/dictionary';
import { TokenError } from '../src/errors';
import { extendDictionary } from '../src/extend';

// Расширение из раздела 7 design.md.
const EXTEND = {
  'theme-gold': { kind: 'color', about: 'Золото для акций и бейджа «Хит»' },
  'theme-gold-foreground': {
    kind: 'color',
    about: 'Текст на золоте',
    derive: { rule: 'contrast', from: 'theme-gold' },
    on: ['theme-gold'],
  },
  'radius-theme-pill': { kind: 'radius', about: 'Капсула для тегов', default: 999 },
  'shadow-theme-glow': {
    kind: 'shadow',
    about: 'Золотое свечение карточки акции',
    default: { x: 0, y: 0, blur: 24, spread: 0, opacity: 0.35, color: 'theme-gold' },
  },
  'choice-theme-ribbon': { kind: 'choice', about: 'Лента «Хит» на карточке', values: ['off', 'on'], default: 'off' },
};

function problemsOf(extension: unknown): readonly string[] {
  try {
    extendDictionary(platformDictionary, extension);
  } catch (error) {
    if (error instanceof TokenError && error.code === 'extension-invalid') return error.problems;
    throw error;
  }
  return [];
}

describe('расширение темой', () => {
  it('дописывает свои токены после базовых, в порядке записи', () => {
    const dictionary = extendDictionary(platformDictionary, EXTEND);
    const names = dictionaryNames(dictionary);
    expect(names).toHaveLength(83);
    expect(names.slice(78)).toEqual(Object.keys(EXTEND));
    expect(names.slice(0, 78)).toEqual(dictionaryNames(platformDictionary));
  });

  it('свои токены без раздела попадают в раздел theme', () => {
    const dictionary = extendDictionary(platformDictionary, EXTEND);
    expect(dictionary.tokens['theme-gold'].group).toBe('theme');
    expect(dictionary.tokens['radius-theme-pill'].group).toBe('theme');
  });

  it('свой токен может опираться на свой и на базовый', () => {
    const dictionary = extendDictionary(platformDictionary, {
      'theme-ink': { kind: 'color', about: 'Надпись акции', derive: { rule: 'contrast', from: 'primary' } },
    });
    expect(dictionary.order).toContain('theme-ink');
    expect(dictionary.order.indexOf('primary')).toBeLessThan(dictionary.order.indexOf('theme-ink'));
  });

  it('словарь платформы не меняется', () => {
    extendDictionary(platformDictionary, EXTEND);
    expect(dictionaryNames(platformDictionary)).toHaveLength(78);
  });
});

describe('шесть ошибок расширения из раздела 7', () => {
  it.each<[string, Record<string, unknown>, string]>([
    ['имя без метки', { gold: { kind: 'color', about: 'Золото' } }, 'gold: свой токен темы называется theme-…'],
    [
      'вид, которого нет',
      { 'theme-x': { kind: 'gradient', about: 'Градиент' } },
      'theme-x: неизвестный вид «gradient»',
    ],
    [
      'пустое описание',
      { 'radius-theme-pill': { kind: 'radius', about: '', default: 999 } },
      'radius-theme-pill: нет описания',
    ],
    [
      'петля',
      {
        'theme-a': { kind: 'color', about: 'Цвет а', derive: { rule: 'alias', from: 'theme-b' } },
        'theme-b': { kind: 'color', about: 'Цвет б', derive: { rule: 'alias', from: 'theme-a' } },
      },
      'петля: theme-a → theme-b → theme-a',
    ],
    [
      'имя платформы',
      { primary: { kind: 'color', about: 'Своя кнопка' } },
      'primary: такой токен уже есть в словаре платформы',
    ],
    [
      'источник другого вида',
      { 'radius-theme-x': { kind: 'radius', about: 'Скругление', derive: { rule: 'alias', from: 'primary' } } },
      'radius-theme-x: «primary» другого вида',
    ],
  ])('%s', (_title, extension, problem) => {
    expect(problemsOf(extension)).toEqual([problem]);
  });

  it('у остальных видов метка стоит после вида', () => {
    expect(problemsOf({ 'radius-pill': { kind: 'radius', about: 'Капсула', default: 999 } })).toEqual([
      'radius-pill: свой токен темы называется radius-theme-…',
    ]);
  });

  it('цвет тени — только цвет словаря', () => {
    const extension = {
      'shadow-theme-x': {
        kind: 'shadow',
        about: 'Свечение',
        default: { x: 0, y: 0, blur: 8, spread: 0, opacity: 0.3, color: 'gold' },
      },
    };
    expect(problemsOf(extension)).toEqual(['shadow-theme-x: цвет тени «gold» — не цвет словаря']);
  });

  it('ошибка формы называет путь в extend', () => {
    const problems = problemsOf({ 'theme-x': { kind: 'color', about: 'Цвет', colour: 'red' } });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^extend\.theme-x: /);
  });
});
