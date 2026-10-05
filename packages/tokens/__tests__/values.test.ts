import { describe, expect, it } from 'vitest';
import themeWithExtension from '../fixtures/theme-with-extension/theme.json';
import { dictionaryNames, platformDictionary } from '../src/dictionary';
import { parseTheme, parseTokenEdits, readTokenEdits } from '../src/values';
import { problemsOf, sample, sampleRaw, type RawTheme } from './support';

const themeProblems = (raw: unknown) => problemsOf('theme-invalid', () => parseTheme(raw));
const editProblems = (raw: unknown) => problemsOf('edits-invalid', () => parseTokenEdits(sample, raw));

describe('значения темы', () => {
  it('образец разбирается: словарь платформы, 16 значений в корне, две схемы', () => {
    expect(sample.dictionary).toBe(platformDictionary);
    expect(Object.keys(sample.tokens.root)).toHaveLength(16);
    expect(Object.keys(sample.tokens.schemes)).toEqual(['scheme-1', 'scheme-2']);
    expect(sample.tokens.schemes['scheme-2'].primary).toBe('#ffffff');
  });

  it('схемы идут по номеру: scheme-10 после scheme-2', () => {
    const raw = sampleRaw();
    const scheme = raw.schemes['scheme-1'];
    raw.schemes = { 'scheme-10': scheme, 'scheme-2': scheme, 'scheme-1': scheme };
    expect(Object.keys(parseTheme(raw).tokens.schemes)).toEqual(['scheme-1', 'scheme-2', 'scheme-10']);
  });

  it.each<[string, (raw: RawTheme) => void, string[]]>([
    [
      'плохой цвет',
      (raw) => {
        raw.schemes['scheme-1'].primary = '#FFF';
      },
      ['schemes.scheme-1.primary: нужно #rrggbb строчными'],
    ],
    [
      'нет базового цвета в схеме',
      (raw) => {
        delete raw.schemes['scheme-2'].primary;
      },
      ['schemes.scheme-2: не задан primary'],
    ],
    [
      'нет базового значения в корне',
      (raw) => {
        delete raw.root['font-body'];
      },
      ['root: не задан font-body'],
    ],
    [
      'размер шрифта: min больше max',
      (raw) => {
        raw.root['text-2xl'] = { min: 40, max: 32, leading: 1.25 };
      },
      ['root.text-2xl: нужно { min, max, leading }: размеры от 8 до 160 px, min ≤ max, leading от 0,8 до 3'],
    ],
    [
      'опечатка в имени',
      (raw) => {
        raw.root['radius-buton'] = 8;
      },
      ['root.radius-buton: такого токена нет в словаре темы'],
    ],
    [
      'вариант выбора не из списка',
      (raw) => {
        raw.root['choice-card-style'] = 'grid';
      },
      ['root.choice-card-style: нужно standard или card'],
    ],
    [
      'схема детали на несуществующую схему',
      (raw) => {
        raw.root['scheme-card'] = 'scheme-3';
      },
      ['root.scheme-card: нужно scheme-1 или scheme-2'],
    ],
    [
      'цвет в корне',
      (raw) => {
        raw.root.primary = '#111111';
      },
      ['root.primary: токен живёт в схеме, а не в корне'],
    ],
    [
      'скругление в схеме',
      (raw) => {
        raw.schemes['scheme-1']['radius-button'] = 8;
      },
      ['schemes.scheme-1.radius-button: токен живёт в корне, а не в схеме'],
    ],
    [
      'стек шрифтов с чужими знаками',
      (raw) => {
        raw.root['font-body'] = 'Manrope; } body { color: red';
      },
      ['root.font-body: нужно стек шрифтов латиницей, как "Manrope, system-ui, sans-serif"'],
    ],
    [
      'цвет тени — не цвет словаря',
      (raw) => {
        raw.root['shadow-card'] = { x: 0, y: 2, blur: 8, spread: 0, opacity: 0.08, color: 'radius-card' };
      },
      [
        'root.shadow-card: нужно { x, y, blur, spread, opacity, color? }: x, y, spread от −100 до 100, ' +
          'blur от 0 до 200, opacity от 0 до 1, color — цвет словаря',
      ],
    ],
    [
      'нет scheme-1',
      (raw) => {
        raw.schemes = { 'scheme-2': raw.schemes['scheme-2'] };
      },
      ['schemes: нет scheme-1'],
    ],
    [
      'имя схемы не по образцу',
      (raw) => {
        raw.schemes.dark = raw.schemes['scheme-2'];
      },
      ['schemes.dark: имя схемы — scheme-1, scheme-2 и так далее'],
    ],
  ])('%s', (_title, change, problems) => {
    const raw = sampleRaw();
    change(raw);
    expect(themeProblems(raw)).toEqual(problems);
  });

  it('все проблемы — одной ошибкой theme-invalid, по строке на каждую', () => {
    const raw = sampleRaw();
    raw.schemes['scheme-1'].primary = '#FFF';
    raw.root['radius-buton'] = 8;
    expect(() => parseTheme(raw)).toThrow(
      'root.radius-buton: такого токена нет в словаре темы\nschemes.scheme-1.primary: нужно #rrggbb строчными',
    );
  });

  it('ошибка формы называет путь от tokens', () => {
    expect(themeProblems({ root: [], schemes: {} })[0]).toMatch(/^tokens\.root: /);
    expect(themeProblems({ ...sampleRaw(), colors: {} })[0]).toMatch(/^tokens: /);
  });
});

describe('тема с расширением', () => {
  it('словарь темы — 83 токена, свой цвет задан в каждой схеме', () => {
    const theme = parseTheme(themeWithExtension.tokens);
    expect(dictionaryNames(theme.dictionary)).toHaveLength(83);
    expect(theme.tokens.schemes['scheme-2']['theme-gold']).toBe('#e0b93a');
  });

  it('свой цвет без умолчания обязателен в каждой схеме', () => {
    const schemes = {
      'scheme-1': themeWithExtension.tokens.schemes['scheme-1'],
      'scheme-2': sampleRaw().schemes['scheme-2'],
    };
    expect(themeProblems({ ...themeWithExtension.tokens, schemes })).toEqual(['schemes.scheme-2: не задан theme-gold']);
  });

  it('ошибка расширения приходит с кодом extension-invalid', () => {
    const raw = { ...sampleRaw(), extend: { gold: { kind: 'color', about: 'Золото' } } };
    expect(problemsOf('extension-invalid', () => parseTheme(raw))).toEqual([
      'gold: свой токен темы называется theme-…',
    ]);
  });
});

describe('правки мерчанта', () => {
  it('правка из раздела 8.3 разбирается как есть', () => {
    const raw = {
      root: { 'radius-button': 999, 'choice-card-style': 'card', 'scheme-card': 'scheme-2' },
      schemes: { 'scheme-1': { primary: '#e91e8c' } },
    };
    expect(parseTokenEdits(sample, raw)).toEqual(raw);
  });

  it.each<[string, unknown, string]>([
    [
      'схемы нет в теме',
      { schemes: { 'scheme-3': { primary: '#e91e8c' } } },
      'schemes.scheme-3: такой схемы нет в теме',
    ],
    [
      'насыщенность не кратна 100',
      { root: { 'weight-body': 450 } },
      'root.weight-body: нужно целое от 100 до 900, кратное 100',
    ],
    [
      'схема детали не из темы',
      { root: { 'scheme-card': 'scheme-3' } },
      'root.scheme-card: нужно scheme-1 или scheme-2',
    ],
    ['цвет в корне', { root: { primary: '#e91e8c' } }, 'root.primary: токен живёт в схеме, а не в корне'],
    ['имя из Object.prototype', { root: { toString: 8 } }, 'root.toString: такого токена нет в словаре темы'],
    [
      'правка к своему токену, которого в новой версии темы нет',
      { schemes: { 'scheme-1': { 'theme-gold': '#c9a227' } } },
      'schemes.scheme-1.theme-gold: такого токена нет в словаре темы',
    ],
  ])('%s', (_title, raw, problem) => {
    expect(editProblems(raw)).toEqual([problem]);
    expect(readTokenEdits(sample.dictionary, sample.tokens, raw).problems).toEqual([problem]);
  });

  it('ошибка формы правок — путь от edits; readTokenEdits не бросает', () => {
    const reading = readTokenEdits(sample.dictionary, sample.tokens, { root: 5 });
    expect(reading.problems).toHaveLength(1);
    expect(reading.problems[0]).toMatch(/^edits\.root: /);
    expect(reading.edits).toEqual({});
  });
});
