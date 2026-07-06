import { buildTokensCss } from '../tokens-css';

/**
 * Регрессия: override-правила типографики были безслойными → для `!important`
 * ПРОИГРЫВАЛИ Tailwind `.\!font-normal` в `@layer utilities` (обратный порядок
 * слоёв для important). Оборачиваем в @layer utilities → в том же слое решает
 * специфичность. + footer scope (footer вне <main>).
 */
describe('typography override @layer', () => {
  it('wraps overrides in @layer utilities + covers footer', () => {
    const css = buildTokensCss({ headingFont: 'oswald', headingWeight: 700 }, 'rose');
    expect(css).toContain('@layer utilities{');
    expect(css).toContain('footer h1[class]');
    expect(css).toMatch(/main h1\[class\][^}]*font-family:var\(--font-heading\)/);
  });
  it('no @layer when nothing customized', () => {
    expect(buildTokensCss({}, 'rose')).not.toContain('@layer utilities{main');
  });
});
