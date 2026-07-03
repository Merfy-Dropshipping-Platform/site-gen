import {
  generateGoogleFontsUrl,
  googleFontsHref,
} from '../constructor-theme-bridge';

/**
 * Регрессия: Google Fonts css2 ОТКЛОНЯЕТ `wght@100..900`, если ось шрифта уже
 * (Comfortaa 300..700) или шрифт невариативный (Tinos) → HTTP 400 → `<link>`
 * падает → шрифт не грузится. Строим URL с РЕАЛЬНЫМИ весами per-font + swap.
 */
describe('google fonts url', () => {
  it('emits per-font real weights (not 100..900) + display=swap', () => {
    const url = generateGoogleFontsUrl('comfortaa', 'manrope');
    expect(url).toContain('family=Comfortaa:wght@300;400;500;600;700');
    expect(url).toContain('family=Manrope:wght@200;300;400;500;600;700;800');
    expect(url).toContain('display=swap');
    expect(url).not.toContain('100..900');
    expect(url).not.toContain('display=optional');
  });

  it('resolves fonts previously missing from the sites map (name, not raw key)', () => {
    // 'oswald' раньше отсутствовал в FONT_FAMILIES → resolveFontName возвращал
    // сырой ключ "oswald" (lowercase) → неверный URL. Теперь — "Oswald".
    const url = generateGoogleFontsUrl('oswald', 'ubuntu');
    expect(url).toContain('family=Oswald:wght@200;300;400;500;600;700');
    expect(url).toContain('family=Ubuntu:wght@300;400;500;700');
  });

  it('non-variable single-weight font → exact weight list', () => {
    expect(generateGoogleFontsUrl('great-vibes', 'tinos')).toContain(
      'family=Great+Vibes:wght@400',
    );
  });

  it('unknown/sites-only font without weights → family=Name (no wght, still valid)', () => {
    const url = googleFontsHref(['Nunito']);
    expect(url).toContain('family=Nunito');
    expect(url).not.toContain('Nunito:wght');
  });

  it('empty input → empty string', () => {
    expect(googleFontsHref([])).toBe('');
    expect(googleFontsHref(['', '  '])).toBe('');
  });
});
