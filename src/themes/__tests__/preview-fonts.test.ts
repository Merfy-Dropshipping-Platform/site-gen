import { previewTokensCssWithFonts } from '../tokens-css';

/**
 * Регрессия: в превью Google-линк статический → выбранный мерчантом шрифт не
 * грузился (семейство объявлено, но не загружено → фолбэк). previewTokensCssWithFonts
 * добавляет @import url(<шрифты>) в содержимое __merfy_tokens_css (все превью-пути).
 */
describe('previewTokensCssWithFonts', () => {
  it('prepends @import for merchant fonts', () => {
    const css = previewTokensCssWithFonts(
      { headingFont: 'sofia-sans-condensed', bodyFont: 'yanone-kaffeesatz' },
      'rose',
    );
    expect(css.startsWith('@import url(')).toBe(true);
    expect(css).toContain('Sofia+Sans+Condensed');
    expect(css).toContain('Yanone+Kaffeesatz');
    expect(css).toContain(':root');
  });
  it('no @import when fonts are default', () => {
    expect(previewTokensCssWithFonts({}, 'rose').startsWith('@import')).toBe(false);
  });
});
