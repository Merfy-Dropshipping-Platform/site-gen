import { HeaderSchema, HeaderPuckConfig, HeaderClasses } from '../index';

/**
 * 084 vanilla pilot — additive variants on Header (universal):
 *   - logoPosition: new value `'center-absolute'` in existing enum
 *   - activeLinkIndicator: new optional field 'none' | 'underline'
 *
 * Default behaviour preserved when these props are unset / use legacy
 * values (`top-left`, `top-center`, `top-right`, `center-left`).
 */
describe('Header additive variants (084)', () => {
  const baseValid = {
    siteTitle: 'Shop',
    logo: '',
    logoPosition: 'top-left' as const,
    stickiness: 'scroll-up' as const,
    menuType: 'dropdown' as const,
    navigationLinks: [],
    actionButtons: { showSearch: true, showCart: true, showProfile: true },
    padding: { top: 16, bottom: 16 },
  };

  it('schema accepts logoPosition="center-absolute"', () => {
    expect(
      HeaderSchema.safeParse({ ...baseValid, logoPosition: 'center-absolute' }).success,
    ).toBe(true);
  });

  it('schema still accepts pre-084 logoPosition values', () => {
    for (const v of ['top-left', 'top-center', 'top-right', 'center-left'] as const) {
      expect(HeaderSchema.safeParse({ ...baseValid, logoPosition: v }).success).toBe(true);
    }
  });

  it('schema accepts activeLinkIndicator="underline"', () => {
    expect(
      HeaderSchema.safeParse({ ...baseValid, activeLinkIndicator: 'underline' }).success,
    ).toBe(true);
  });

  it('schema accepts activeLinkIndicator="none"', () => {
    expect(
      HeaderSchema.safeParse({ ...baseValid, activeLinkIndicator: 'none' }).success,
    ).toBe(true);
  });

  it('schema rejects invalid activeLinkIndicator', () => {
    expect(
      HeaderSchema.safeParse({
        ...baseValid,
        activeLinkIndicator: 'dot' as unknown as 'none',
      }).success,
    ).toBe(false);
  });

  it('schema works without activeLinkIndicator (backwards compat)', () => {
    expect(HeaderSchema.safeParse(baseValid).success).toBe(true);
  });

  it('PuckConfig keeps logoPosition + adds activeLinkIndicator field', () => {
    const fields = HeaderPuckConfig.fields as Record<string, unknown>;
    expect(fields.logoPosition).toBeDefined();
    expect(fields.activeLinkIndicator).toBeDefined();
  });

  it('Classes export logoWrap mapping including "center-absolute"', () => {
    const c = HeaderClasses as Record<string, unknown>;
    const logoWrap = c.logoWrap as Record<string, string>;
    expect(logoWrap['center-absolute']).toBeDefined();
    // Vanilla center-absolute: absolute + translate-x for desktop pinning.
    expect(logoWrap['center-absolute']).toMatch(/absolute/);
    expect(logoWrap['center-absolute']).toMatch(/-translate-x-1\/2/);
  });

  it('Classes export activeIndicator wrapper + span definitions', () => {
    const c = HeaderClasses as Record<string, unknown>;
    expect(c.activeIndicator).toBeDefined();
    const map = c.activeIndicator as { underline: { wrapper: string; span: string } };
    expect(map.underline.wrapper).toMatch(/relative/);
    expect(map.underline.span).toMatch(/absolute/);
  });
});
