import { describe, expect, it } from 'vitest';
import { KINDS, TOKEN_KINDS, classesOf, orText, valueText, type ValueContext } from '../src/kinds';
import type { TokenKind } from '../src/types';

const context: ValueContext = {
  values: ['standard', 'card'],
  schemeIds: ['scheme-1', 'scheme-2'],
  colorNames: ['primary', 'theme-gold'],
};
const accepts = (kind: TokenKind, value: unknown): boolean => KINDS[kind].schema(context).safeParse(value).success;

describe('таблица видов', () => {
  it('знает ровно 12 видов, цвет живёт в схеме, остальные — в корне', () => {
    expect(TOKEN_KINDS).toHaveLength(12);
    expect(Object.keys(KINDS)).toEqual([...TOKEN_KINDS]);
    const schemeKinds = TOKEN_KINDS.filter((kind) => KINDS[kind].scope === 'scheme');
    expect(schemeKinds).toEqual(['color']);
  });

  it('у каждого вида приставка имени — сам вид, у цвета её нет', () => {
    expect(KINDS.color.prefix).toBe('');
    const withPrefix = TOKEN_KINDS.filter((kind) => kind !== 'color');
    expect(withPrefix.map((kind) => KINDS[kind].prefix)).toEqual(withPrefix.map((kind) => `${kind}-`));
  });
});

describe('проверка значений по видам', () => {
  it.each<[TokenKind, unknown, unknown]>([
    ['color', '#e91e8c', '#E91E8C'],
    ['color', '#111111', 'red'],
    ['font', 'Manrope, system-ui, sans-serif', 'Manrope; } body { color: red'],
    ['weight', 600, 650],
    ['weight', 100, 1000],
    ['text', { min: 24, max: 32, leading: 1.25 }, { min: 32, max: 24, leading: 1.25 }],
    ['text', { min: 12, max: 12, leading: 1.5 }, { min: 12, max: 12 }],
    ['tracking', -0.01, 0.6],
    ['radius', 8, -1],
    ['radius', { min: 8, max: 16 }, { min: 16, max: 8 }],
    ['radius', 999, 1000],
    ['border-width', 1, 1.5],
    ['shadow', { x: 0, y: 8, blur: 24, spread: 0, opacity: 0.12 }, { x: 0, y: 8, blur: 24, spread: 0, opacity: 2 }],
    [
      'shadow',
      { x: 0, y: 0, blur: 24, spread: 0, opacity: 0.35, color: 'theme-gold' },
      { x: 0, y: 0, blur: 24, spread: 0, opacity: 0.35, color: 'gold' },
    ],
    ['spacing', { min: 48, max: 96 }, 401],
    ['width', 1280, 2561],
    ['choice', 'card', 'grid'],
    ['scheme', 'scheme-2', 'scheme-3'],
  ])('%s: %j годится, %j — нет', (kind, good, bad) => {
    expect(accepts(kind, good)).toBe(true);
    expect(accepts(kind, bad)).toBe(false);
  });

  it('цвет тени без списка цветов проверяет только форму', () => {
    const shape = KINDS.shadow.schema({ values: [], schemeIds: [] });
    expect(shape.safeParse({ x: 0, y: 0, blur: 0, spread: 0, opacity: 0.5, color: 'gold' }).success).toBe(true);
  });

  it('пишет пределы словами — тот же текст стоит в ошибке после «нужно»', () => {
    expect(KINDS.radius.limits(context)).toBe('от 0 до 999 px или { min, max }, min ≤ max');
    expect(KINDS.weight.limits(context)).toBe('целое от 100 до 900, кратное 100');
    expect(KINDS.choice.limits(context)).toBe('standard или card');
    expect(KINDS.scheme.limits(context)).toBe('scheme-1 или scheme-2');
    expect(KINDS.text.limits(context)).toBe(
      '{ min, max, leading }: размеры от 8 до 160 px, min ≤ max, leading от 0,8 до 3',
    );
  });

  it('orText перечисляет через запятую и «или»', () => {
    expect(orText(['left', 'center', 'right'])).toBe('left, center или right');
    expect(orText(['scheme-1'])).toBe('scheme-1');
    expect(orText([])).toBe('');
  });
});

describe('классы', () => {
  it.each<[string, TokenKind, string[] | undefined, string[]]>([
    ['primary', 'color', undefined, ['bg-primary', 'text-primary', 'border-primary']],
    ['font-heading', 'font', undefined, ['font-heading']],
    ['weight-body', 'weight', undefined, ['weight-body']],
    ['text-2xl', 'text', undefined, ['text-2xl']],
    ['tracking-heading', 'tracking', undefined, ['tracking-heading']],
    ['radius-button', 'radius', undefined, ['rounded-button']],
    ['border-width-card', 'border-width', undefined, ['border-width-card']],
    ['shadow-card', 'shadow', undefined, ['shadow-card']],
    ['spacing-section', 'spacing', undefined, ['p-section', 'gap-section']],
    ['width-page', 'width', undefined, ['max-w-page', 'w-page']],
    [
      'choice-card-align',
      'choice',
      ['left', 'center', 'right'],
      ['card-align-left:', 'card-align-center:', 'card-align-right:'],
    ],
    ['scheme-card', 'scheme', undefined, ['scheme-card']],
  ])('%s даёт свои классы', (name, kind, values, classes) => {
    expect(classesOf(name, { kind, values })).toEqual(classes);
  });
});

describe('значение словами', () => {
  it.each<[TokenKind, Parameters<typeof valueText>[1], string]>([
    ['text', { min: 24, max: 32, leading: 1.25 }, '24–32 px, межстрочный 1.25'],
    ['text', { min: 12, max: 12, leading: 1.5 }, '12 px, межстрочный 1.5'],
    ['shadow', { x: 0, y: 8, blur: 24, spread: 0, opacity: 0.12 }, '0 8 24 0, 12 %'],
    ['shadow', { x: 0, y: 0, blur: 0, spread: 0, opacity: 0 }, 'без тени'],
    [
      'shadow',
      { x: 0, y: 0, blur: 24, spread: 0, opacity: 0.35, color: 'theme-gold' },
      '0 0 24 0, 35 %, цвет theme-gold',
    ],
    ['tracking', 0, '0 em'],
    ['radius', { min: 8, max: 16 }, '8–16 px'],
    ['radius', 8, '8 px'],
    ['color', '#ffffff', '#ffffff'],
    ['weight', 600, '600'],
    ['radius', undefined, 'не задано'],
  ])('%s %j → «%s»', (kind, value, text) => {
    expect(valueText(kind, value)).toBe(text);
  });
});
