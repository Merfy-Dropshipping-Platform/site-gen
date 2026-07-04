import { buildTokensCss } from '../tokens-css';

/**
 * Регрессия: fontFamily в tokens-css знал только 5 ключей (comfortaa/manrope/
 * inter/playfair-display/roboto). Любой другой (e.g. 'exo-2') отдавался сырым
 * ключом → --font-body:"exo-2" → браузер не находит семейство → фолбэк → шрифт
 * мерчанта не применялся (в превью конструктора). Теперь резолвим все 44 через
 * общий resolveFontFamily.
 */
describe('buildTokensCss font-family resolution', () => {
  it('resolves keys outside the legacy top-5 to proper family', () => {
    const css = buildTokensCss({ headingFont: 'oswald', bodyFont: 'exo-2' }, 'rose');
    const fb = (css.match(/--font-body:\s*([^;]+)/) || [])[1]?.trim();
    const fh = (css.match(/--font-heading:\s*([^;]+)/) || [])[1]?.trim();
    expect(fb).toContain('Exo 2');
    expect(fb).not.toMatch(/"exo-2"/);
    expect(fh).toContain('Oswald');
  });

  it('still resolves the legacy top-5 keys', () => {
    const css = buildTokensCss({ headingFont: 'comfortaa', bodyFont: 'manrope' }, 'rose');
    expect(css).toMatch(/--font-heading:\s*"Comfortaa"/);
    expect(css).toMatch(/--font-body:\s*"Manrope"/);
  });
});
