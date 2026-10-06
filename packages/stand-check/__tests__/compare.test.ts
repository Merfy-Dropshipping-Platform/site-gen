import { describe, expect, it } from 'vitest';
import rulesJson from '../compare-rules.json';
import { comparePassports, verdictOf } from '../src/compare/compare';
import { parseRules } from '../src/compare/rules';
import type { Difference, FieldRule } from '../src/types';
import { broken, cleanPassport } from './support/passports';

const rules = parseRules(rulesJson);
const brief = (differences: Difference[]) =>
  differences.map(({ field, op, name, severity }) => ({ field, op, name, severity }));

describe('comparePassports и verdictOf — как живой образец стенда', () => {
  it('два одинаковых прогона — отличий нет, «чисто»', () => {
    const differences = comparePassports(cleanPassport(), cleanPassport(), rules);
    expect(differences).toEqual([]);
    expect(verdictOf(differences)).toBe('clean');
  });

  it('лишний скрипт — красный; его запрос — жёлтый', () => {
    const differences = comparePassports(cleanPassport(), broken('script'), rules);
    expect(brief(differences)).toEqual([
      { field: 'scripts', op: 'added', name: 'https://widget.example/chat.js', severity: 'red' },
      { field: 'requests', op: 'added', name: 'https://widget.example/chat.js', severity: 'amber' },
    ]);
    expect(verdictOf(differences)).toBe('red');
  });

  it('глобал __MERFY_SITE_ID__ — красный', () => {
    const differences = comparePassports(cleanPassport(), broken('global'), rules);
    expect(brief(differences)).toEqual([{ field: 'globals', op: 'added', name: '__MERFY_SITE_ID__', severity: 'red' }]);
    expect(verdictOf(differences)).toBe('red');
  });

  it('другой ключ корзины — красный: merfy:cartId пропал, cart:v2 появился', () => {
    const differences = comparePassports(cleanPassport(), broken('cart'), rules);
    expect(brief(differences)).toEqual([
      { field: 'storage', op: 'removed', name: 'local:merfy:cartId', severity: 'red' },
      { field: 'storage', op: 'added', name: 'local:cart:v2', severity: 'red' },
    ]);
    expect(verdictOf(differences)).toBe('red');
  });

  it('лишний скрипт, глобал и другой ключ корзины вместе — красный, пять отличий', () => {
    const differences = comparePassports(cleanPassport(), broken('script', 'global', 'cart'), rules);
    expect(differences).toHaveLength(5);
    expect(verdictOf(differences)).toBe('red');
  });

  it('правка цвета из панели — жёлтый: поменялись два токена', () => {
    const differences = comparePassports(cleanPassport(), broken('panel'), rules);
    expect(brief(differences)).toEqual([
      { field: 'tokens', op: 'changed', name: '--primary', severity: 'amber' },
      { field: 'tokens', op: 'changed', name: '--primary-foreground', severity: 'amber' },
    ]);
    expect(differences[0]).toMatchObject({ before: '#111111', after: '#e91e8c' });
    expect(verdictOf(differences)).toBe('amber');
  });

  it('шрифт не загрузился — красный: ответ 404 и шрифт пропал', () => {
    const differences = comparePassports(cleanPassport(), broken('font'), rules);
    expect(brief(differences)).toEqual([
      { field: 'requests', op: 'changed', name: '/fonts/manrope-700.woff2', severity: 'red' },
      { field: 'fonts', op: 'removed', name: 'Manrope 700 normal', severity: 'red' },
    ]);
  });

  it('новый хэш скрипта — жёлтый, причина про код скрипта', () => {
    const after = cleanPassport();
    after.scripts[0] = { ...after.scripts[0], hash: '9b8c7d6e' };
    const differences = comparePassports(cleanPassport(), after, rules);
    expect(brief(differences)).toEqual([
      { field: 'scripts', op: 'changed', name: '/_astro/shell.*.js', severity: 'amber' },
    ]);
    expect(differences[0].reason).toBe('Новый хэш или размер — код скрипта поменялся. Посмотри, что в него добавили.');
  });

  it('ошибка ушла — жёлтый со своей причиной; появилась — красный с общей', () => {
    const gone = comparePassports(broken('error'), cleanPassport(), rules);
    expect(gone[0]).toMatchObject({
      op: 'removed',
      severity: 'amber',
      reason: 'Ошибка ушла — проверь, что её исправили, а не спрятали.',
    });
    const came = comparePassports(cleanPassport(), broken('error'), rules);
    expect(came[0]).toMatchObject({
      op: 'added',
      severity: 'red',
      reason: 'Ошибка в консоли — что-то на странице не работает.',
    });
  });

  it('правило без серьёзности для отличия — ошибка rules-invalid', () => {
    const tokensRule: FieldRule = {
      field: 'tokens',
      shape: 'map',
      severity: { added: 'amber' },
      reason: { all: 'тест' },
    };
    expect(() => comparePassports(cleanPassport(), broken('panel'), [tokensRule])).toThrow(
      /^rules-invalid: tokens: нет серьёзности для changed/,
    );
  });
});

describe('verdictOf', () => {
  const difference = (severity: Difference['severity']): Difference => ({
    field: 'tokens',
    op: 'changed',
    name: '--primary',
    severity,
    reason: 'тест',
  });

  it('только жёлтые отличия — жёлтый', () => {
    expect(verdictOf([difference('amber'), difference('amber')])).toBe('amber');
  });

  it('хотя бы одно красное — красный', () => {
    expect(verdictOf([difference('amber'), difference('red')])).toBe('red');
  });
});
