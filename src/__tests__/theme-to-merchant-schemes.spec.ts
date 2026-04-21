import { themeToMerchantColorSchemes } from '../themes/theme-manifest-loader';

describe('themeToMerchantColorSchemes', () => {
  it('returns empty array for unknown theme id', () => {
    expect(themeToMerchantColorSchemes('unknown-theme')).toEqual([]);
  });

  it('converts rose manifest into merchant shape', () => {
    const result = themeToMerchantColorSchemes('rose');
    expect(result.length).toBeGreaterThanOrEqual(3);
    for (const scheme of result) {
      expect(scheme.id).toMatch(/^scheme-\d+$/);
      expect(scheme.background).toMatch(/^#[0-9a-f]{6}$/i);
      expect(scheme.heading).toMatch(/^#[0-9a-f]{6}$/i);
      expect(scheme.primaryButton.background).toMatch(/^#[0-9a-f]{6}$/i);
      expect(scheme.primaryButton.text).toMatch(/^#[0-9a-f]{6}$/i);
      expect(scheme.secondaryButton.background).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('rose scheme-1 background is white (Light theme)', () => {
    const result = themeToMerchantColorSchemes('rose');
    const s1 = result.find((s) => s.id === 'scheme-1');
    expect(s1?.background.toLowerCase()).toBe('#ffffff');
  });

  it('vanilla scheme-2 background is medium olive (per theme-vanilla/theme.json)', () => {
    const result = themeToMerchantColorSchemes('vanilla');
    const s2 = result.find((s) => s.id === 'scheme-2');
    expect(s2?.background.toLowerCase()).toBe('#3a4530');
  });

  it('each returned scheme has the full MerchantColorScheme shape', () => {
    const result = themeToMerchantColorSchemes('bloom');
    for (const s of result) {
      expect(s).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          text: expect.any(String),
          heading: expect.any(String),
          surfaceBg: expect.any(String),
          background: expect.any(String),
          primaryButton: expect.objectContaining({
            text: expect.any(String),
            border: expect.any(String),
            textHover: expect.any(String),
            background: expect.any(String),
            backgroundHover: expect.any(String),
          }),
          secondaryButton: expect.objectContaining({
            text: expect.any(String),
            border: expect.any(String),
            textHover: expect.any(String),
            background: expect.any(String),
            backgroundHover: expect.any(String),
          }),
        }),
      );
    }
  });
});
