import { describe, expect, it } from 'vitest';
import themeWithExtension from '../fixtures/theme-with-extension/theme.json';
import { choiceAttributes, editsAt, resolveTokens } from '../src/resolve';
import { parseTheme } from '../src/values';
import { pink, sample } from './support';

const resolvePink = (scheme: Record<string, string>) =>
  resolveTokens(pink.dictionary, pink.tokens, { schemes: { 'scheme-1': scheme } }).schemes['scheme-1'];

describe('Т1-4 Б на розовой схеме из раздела 6', () => {
  it('без правок надпись на кнопке — белая, как задала тема', () => {
    const colors = resolvePink({});
    expect(colors['primary-foreground']).toBe('#ffffff');
    expect(colors['primary-hover']).toBe('#cd1a7b');
    expect(colors['primary-hover-foreground']).toBe('#ffffff');
  });

  it('мерчант сделал кнопку жёлтой — надпись пересчитана правилом и стала чёрной', () => {
    const colors = resolvePink({ primary: '#facc15' });
    expect(colors['primary-foreground']).toBe('#000000');
    expect(colors['primary-hover-foreground']).toBe('#000000');
    expect(colors['primary-hover']).toBe('#dcb412');
  });

  it('тема задала sale, мерчант поменял destructive — sale идёт за ним', () => {
    const theme = parseTheme({
      root: sample.tokens.root,
      schemes: { 'scheme-1': { ...pink.tokens.schemes['scheme-1'], sale: '#e11d48' } },
    });
    const before = resolveTokens(theme.dictionary, theme.tokens, {}).schemes['scheme-1'];
    const after = resolveTokens(theme.dictionary, theme.tokens, {
      schemes: { 'scheme-1': { destructive: '#b91c1c' } },
    });
    expect(before.sale).toBe('#e11d48');
    expect(after.schemes['scheme-1'].sale).toBe('#b91c1c');
  });

  it('правка, совпавшая со значением темы, ничего не пересчитывает', () => {
    expect(resolvePink({ primary: '#e91e8c' })['primary-foreground']).toBe('#ffffff');
  });

  it('явная правка мерчанта главнее правила', () => {
    expect(resolvePink({ primary: '#facc15', 'primary-foreground': '#111111' })['primary-foreground']).toBe('#111111');
  });
});

describe('расчёт образца', () => {
  const resolved = resolveTokens(sample.dictionary, sample.tokens, {});

  it('наведение кнопки: #2e2e2e в схеме 1 и #e0e0e0 в схеме 2', () => {
    expect(resolved.schemes['scheme-1']['primary-hover']).toBe('#2e2e2e');
    expect(resolved.schemes['scheme-2']['primary-hover']).toBe('#e0e0e0');
  });

  it('все 32 цвета в каждой схеме и 43 значения в корне: три схемы деталей не заданы', () => {
    expect(Object.keys(resolved.schemes['scheme-1'])).toHaveLength(32);
    expect(Object.keys(resolved.schemes['scheme-2'])).toHaveLength(32);
    expect(Object.keys(resolved.root)).toHaveLength(43);
    expect('scheme-card' in resolved.root).toBe(false);
  });

  it('умолчания и цепочки: радиус поля как у кнопки, рамка поля 1 px, шрифт заголовков как у текста', () => {
    expect(resolved.root['radius-input']).toBe(8);
    expect(resolved.root['border-width-input']).toBe(1);
    expect(resolved.root['font-heading']).toBe('Manrope, system-ui, sans-serif');
    expect(resolved.schemes['scheme-1']['muted-foreground']).toBe('#707070');
  });

  it('правка радиуса кнопки тянет за собой поле и бейдж', () => {
    const edited = resolveTokens(sample.dictionary, sample.tokens, { root: { 'radius-button': 16 } });
    expect(edited.root['radius-input']).toBe(16);
    expect(edited.root['radius-badge']).toBe(16);
  });

  it('правка к схеме, которой нет в теме, не считается', () => {
    const edited = resolveTokens(sample.dictionary, sample.tokens, { schemes: { 'scheme-3': { primary: '#000000' } } });
    expect(Object.keys(edited.schemes)).toEqual(['scheme-1', 'scheme-2']);
  });
});

describe('правки одного места и атрибуты выборов', () => {
  it('editsAt отдаёт набор корня или схемы, без правок — пустой', () => {
    const edits = { root: { 'radius-button': 16 }, schemes: { 'scheme-1': { primary: '#16a34a' } } };
    expect(editsAt(edits, 'root')).toEqual({ 'radius-button': 16 });
    expect(editsAt(edits, 'scheme-1')).toEqual({ primary: '#16a34a' });
    expect(editsAt(edits, 'scheme-2')).toEqual({});
    expect(editsAt({}, 'root')).toEqual({});
  });

  it('четыре выбора словаря — атрибуты data- на <html>', () => {
    expect(choiceAttributes(sample.dictionary, resolveTokens(sample.dictionary, sample.tokens, {}))).toEqual({
      'data-card-style': 'standard',
      'data-card-align': 'left',
      'data-motion-reveal': 'off',
      'data-motion-hover': 'none',
    });
  });

  it('выбор из расширения темы тоже становится атрибутом', () => {
    const theme = parseTheme(themeWithExtension.tokens);
    const attributes = choiceAttributes(theme.dictionary, resolveTokens(theme.dictionary, theme.tokens, {}));
    expect(attributes['data-theme-ribbon']).toBe('off');
  });
});
