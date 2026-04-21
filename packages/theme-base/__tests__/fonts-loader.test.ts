import { buildFontHead } from '../fonts/loader';

describe('buildFontHead', () => {
  it('builds Google Fonts link for source=google', () => {
    const html = buildFontHead([{ family: 'Bitter', weights: [400, 700], source: 'google' }]);
    expect(html).toMatch(/fonts\.googleapis\.com/);
    expect(html).toMatch(/Bitter/);
    expect(html).toMatch(/400;700/);
  });

  it('includes italic variant when italic: true', () => {
    const html = buildFontHead([{ family: 'Bitter', weights: [400], italic: true, source: 'google' }]);
    expect(html).toMatch(/ital,wght@0,400;1,400/);
  });

  it('builds @font-face for self-hosted (source starts with ./)', () => {
    const html = buildFontHead([{ family: 'Custom', weights: [400], source: './fonts/custom.woff2' }]);
    expect(html).toMatch(/@font-face/);
    expect(html).toMatch(/Custom/);
    expect(html).toMatch(/custom\.woff2/);
  });

  it('includes preconnect hints for Google Fonts', () => {
    const html = buildFontHead([{ family: 'Bitter', weights: [400], source: 'google' }]);
    expect(html).toMatch(/preconnect.*fonts\.gstatic\.com/);
  });

  it('handles multiple fonts in one call', () => {
    const html = buildFontHead([
      { family: 'Bitter', weights: [400], source: 'google' },
      { family: 'Arsenal', weights: [400, 700], source: 'google' },
    ]);
    expect(html.match(/family=/g)?.length).toBe(2);
  });
});
