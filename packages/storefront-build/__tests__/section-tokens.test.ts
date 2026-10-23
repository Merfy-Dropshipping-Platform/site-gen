import { describe, expect, it } from 'vitest';
import { pageSectionTheme, shopSectionTokensCss } from '../src/section-tokens';

// Токены секций в сборке и превью (блок 4 «Секций и SDK», Р4-10, Р4-11).
const SWATCH = {
  'custom-swatch': { kind: 'color', about: 'Обводка образца ткани', derive: { rule: 'alias', from: 'primary' } },
};
const SECTIONS = [{ name: 'shop:swatch-grid', tokens: SWATCH }, { name: 'shop:plain' }];

describe('значения токенов секций магазина', () => {
  it('правило на секцию с токенами; умолчание — ссылка на токен словаря', () => {
    const { css, problems } = shopSectionTokensCss(SECTIONS, {});
    expect(css).toContain('merfy-section[data-section="shop:swatch-grid"]');
    expect(css).toContain('--custom-swatch: var(--primary);');
    expect(css).not.toContain('shop:plain');
    expect(problems).toEqual([]);
  });

  it('правка мерчанта — вместо умолчания', () => {
    const { css } = shopSectionTokensCss(SECTIONS, {
      sections: { 'shop:swatch-grid': { 'custom-swatch': '#c9a227' } },
    });
    expect(css).toContain('--custom-swatch: #c9a227;');
  });

  it('неверная правка — в problems, значение — умолчание', () => {
    const broken = { sections: { 'shop:swatch-grid': { 'custom-swatch': 'red;} body{color:red' } } };
    const { css, problems } = shopSectionTokensCss(SECTIONS, broken);
    expect(css).toContain('--custom-swatch: var(--primary);');
    expect(css).not.toContain('body{');
    expect(problems).toHaveLength(1);
  });
});

describe('строки @theme секций страницы', () => {
  it('по секциям страницы; одно имя у двух секций — одна строка', () => {
    const twice = [...SECTIONS, { name: 'shop:swatch-list', tokens: SWATCH }];
    const theme = pageSectionTheme(twice, ['shop:swatch-grid', 'shop:swatch-list', 'shop:plain']);
    expect(theme.match(/--color-custom-swatch:/g)).toHaveLength(1);
    expect(pageSectionTheme(twice, ['shop:plain'])).toBe('');
  });
});
