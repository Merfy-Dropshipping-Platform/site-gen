import { describe, expect, it } from 'vitest';
import themeWithExtension from '../fixtures/theme-with-extension/theme.json';
import { platformDictionary } from '../src/dictionary';
import { checkEdits, dependentsOf, groupsOf, limitsOf, mergeEdits, searchCatalog, sourceOf } from '../src/helpers';
import { parseTheme } from '../src/values';
import { sample } from './support';

const { dictionary, tokens } = sample;
const GREEN = { schemes: { 'scheme-1': { primary: '#16a34a' }, 'scheme-2': { primary: '#22c55e' } } };

describe('groupsOf', () => {
  it('12 разделов платформы, в сумме 78 токенов и 20 обязательных', () => {
    const groups = groupsOf(platformDictionary);
    expect(groups.map((group) => [group.id, group.names.length, group.required.length])).toEqual([
      ['colors-base', 14, 2],
      ['colors-buttons', 10, 1],
      ['colors-shop', 8, 1],
      ['type', 15, 12],
      ['buttons', 3, 1],
      ['inputs', 3, 0],
      ['cards', 7, 1],
      ['media', 3, 0],
      ['popover', 5, 0],
      ['page', 6, 2],
      ['motion', 2, 0],
      ['slots', 2, 0],
    ]);
    expect(groups.flatMap((group) => group.names)).toHaveLength(78);
    expect(groups.flatMap((group) => group.required)).toHaveLength(20);
  });

  it('свои токены темы — тринадцатый раздел theme', () => {
    const groups = groupsOf(parseTheme(themeWithExtension.tokens).dictionary);
    expect(groups).toHaveLength(13);
    expect(groups[12]).toMatchObject({ id: 'theme', required: ['theme-gold'] });
    expect(groups[12].names).toHaveLength(5);
  });
});

describe('searchCatalog', () => {
  it('запись на токен: имя через «_», вид словами в описании', () => {
    const catalog = searchCatalog(platformDictionary);
    expect(catalog).toHaveLength(78);
    expect(catalog[0]).toEqual({
      name: 'background',
      token: 'background',
      group: 'colors-base',
      description: 'Фон страницы и секции (цвет)',
    });
    expect(catalog.find((entry) => entry.token === 'primary-hover')?.name).toBe('primary_hover');
  });
});

describe('sourceOf', () => {
  it.each<[string, string, string]>([
    ['root', 'radius-button', 'theme'],
    ['root', 'radius-input', 'rule'],
    ['root', 'border-width-input', 'default'],
    ['root', 'scheme-card', 'unset'],
    ['scheme-1', 'primary', 'theme'],
    ['scheme-1', 'primary-foreground', 'rule'],
  ])('%s %s — %s', (scope, name, source) => {
    expect(sourceOf(dictionary, tokens, {}, scope, name)).toBe(source);
  });

  it('после правки radius-button: 16 — edit', () => {
    expect(sourceOf(dictionary, tokens, { root: { 'radius-button': 16 } }, 'root', 'radius-button')).toBe('edit');
  });
});

describe('dependentsOf', () => {
  it('у primary — ровно 7, в порядке словаря', () => {
    expect(dependentsOf(dictionary, 'primary')).toEqual([
      'primary-foreground',
      'primary-hover',
      'primary-hover-foreground',
      'primary-border',
      'ring',
      'badge',
      'badge-foreground',
    ]);
  });

  it('по цепочке: radius-button тянет поле и бейдж, foreground — 16 цветов, width-logo — никого', () => {
    expect(dependentsOf(dictionary, 'radius-button')).toEqual(['radius-input', 'radius-badge']);
    expect(dependentsOf(dictionary, 'foreground')).toHaveLength(16);
    expect(dependentsOf(dictionary, 'width-logo')).toEqual([]);
  });

  it('цвет тени тоже связь: золото тянет надпись и свечение', () => {
    const extended = parseTheme(themeWithExtension.tokens).dictionary;
    expect(dependentsOf(extended, 'theme-gold')).toEqual(['theme-gold-foreground', 'shadow-theme-glow']);
  });
});

describe('limitsOf', () => {
  it.each<[string, string]>([
    ['radius-button', 'от 0 до 999 px или { min, max }, min ≤ max'],
    ['choice-card-style', 'standard или card'],
    ['scheme-card', 'scheme-1 или scheme-2'],
    ['primary', '#rrggbb строчными'],
  ])('%s — %s', (name, limits) => {
    expect(limitsOf(dictionary, tokens, name)).toBe(limits);
  });
});

describe('mergeEdits', () => {
  it('новые правки поверх прежних, по месту', () => {
    const current = { root: { 'radius-button': 16 }, schemes: { 'scheme-1': { primary: '#111111' } } };
    const proposed = {
      root: { 'radius-card': 4 },
      schemes: { 'scheme-1': { primary: '#16a34a' }, 'scheme-2': { primary: '#22c55e' } },
    };
    expect(mergeEdits(current, proposed)).toEqual({
      root: { 'radius-button': 16, 'radius-card': 4 },
      schemes: { 'scheme-1': { primary: '#16a34a' }, 'scheme-2': { primary: '#22c55e' } },
    });
    expect(mergeEdits({}, {})).toEqual({ root: {}, schemes: {} });
  });
});

describe('checkEdits', () => {
  it('зелёные кнопки: 13 изменений — 2 правкой, 7 вслед в схеме 1 и 4 в схеме 2, новых проблем нет', () => {
    const result = checkEdits(dictionary, tokens, {}, GREEN);
    const direct = result.changes.filter((change) => change.name === 'primary');
    const follow = (scope: string) =>
      result.changes.filter((change) => change.scope === scope && change.name !== 'primary');
    expect(result.problems).toEqual([]);
    expect(result.changes).toHaveLength(13);
    expect(direct).toHaveLength(2);
    expect(follow('scheme-1').map((change) => change.name)).toEqual([
      'primary-foreground',
      'primary-hover',
      'primary-hover-foreground',
      'primary-border',
      'ring',
      'badge',
      'badge-foreground',
    ]);
    expect(follow('scheme-2')).toHaveLength(4);
    expect(result.issues).toEqual([]);
  });

  it('светлый текст: 17 изменений и 11 новых проблем, первая — foreground на background, 1,26', () => {
    const result = checkEdits(dictionary, tokens, {}, { schemes: { 'scheme-1': { foreground: '#e5e5e5' } } });
    expect(result.changes).toHaveLength(17);
    expect(result.issues).toHaveLength(11);
    expect([result.issues[0].text, result.issues[0].on, result.issues[0].ratio.toFixed(2)]).toEqual([
      'foreground',
      'background',
      '1.26',
    ]);
  });

  it('вариант не из списка — одна ошибка, изменений нет', () => {
    expect(checkEdits(dictionary, tokens, {}, { root: { 'choice-card-style': 'grid' } })).toEqual({
      problems: ['root.choice-card-style: нужно standard или card'],
      changes: [],
      issues: [],
    });
  });

  it('та же величина, что сейчас, — изменений нет', () => {
    expect(checkEdits(dictionary, tokens, {}, { root: { 'radius-button': 8 } }).changes).toEqual([]);
  });

  it('примерка считает от прежних правок', () => {
    const result = checkEdits(dictionary, tokens, { root: { 'radius-button': 16 } }, { root: { 'radius-button': 8 } });
    expect(result.changes.map((change) => [change.name, change.from, change.to])).toEqual([
      ['radius-button', 16, 8],
      ['radius-input', 16, 8],
      ['radius-badge', 16, 8],
    ]);
  });
});
