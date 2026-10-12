import { describe, expect, it } from 'vitest';
import { comparePassports, loadReleaseRules, verdictOf } from '../src/index';
import { cleanPassport } from './support/passports';

describe('правила выпуска (design.md блока 10): красное — только поломка', () => {
  it('красное — новая ошибка в консоли, пропавший токен, пропавший шрифт', async () => {
    const rules = await loadReleaseRules();
    const red = rules.flatMap((rule) =>
      Object.entries(rule.severity)
        .filter(([, severity]) => severity === 'red')
        .map(([op]) => `${rule.field}:${op}`),
    );
    expect(red).toEqual(['errors:added', 'tokens:removed', 'fonts:removed']);
  });

  it('новый скрипт и другой цвет — жёлтое; новая ошибка — красное', async () => {
    const rules = await loadReleaseRules();
    const restyled = cleanPassport();
    restyled.scripts.push({ src: '/_astro/gallery.*.js', kind: 'module', bytes: 2048, hash: 'a1b2c3d4' });
    restyled.tokens['--primary'] = '#222222';
    expect(verdictOf(comparePassports(cleanPassport(), restyled, rules))).toBe('amber');
    const failing = cleanPassport();
    failing.errors.push('TypeError: cart is undefined');
    expect(verdictOf(comparePassports(cleanPassport(), failing, rules))).toBe('red');
  });

  it('тот же паспорт — чисто', async () => {
    expect(verdictOf(comparePassports(cleanPassport(), cleanPassport(), await loadReleaseRules()))).toBe('clean');
  });
});
