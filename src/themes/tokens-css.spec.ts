/**
 * Spec 082 Stage 2a N4.5 — merchant precedence in buildTokensCss.
 *
 * Pre-fix: `themeFirst()` made theme manifest defaults always win over
 * merchant overrides for radii/fonts/sizes/spacing — silently discarding
 * any value typed into ThemeSettingsPanel. This test pins the new
 * "merchant wins" cascade so future refactors can't regress it.
 */
import { buildTokensCss } from './tokens-css';

describe('buildTokensCss merchant precedence', () => {
  it('merchant buttonRadius overrides Rose manifest default (6px)', () => {
    const css = buildTokensCss({ buttonRadius: 24 }, 'rose');
    expect(css).toContain('--radius-button: 24px');
  });

  it('manifest default used when merchant did not set buttonRadius', () => {
    const css = buildTokensCss({}, 'rose');
    // Rose manifest has --radius-button: 6px
    expect(css).toContain('--radius-button: 6px');
  });

  it('hardcoded fallback used when no merchant + no manifest', () => {
    const css = buildTokensCss({}, null);
    // No theme → hardcoded '0px'
    expect(css).toContain('--radius-button: 0px');
  });

  it('merchant headingFont overrides Rose Comfortaa', () => {
    const css = buildTokensCss({ headingFont: 'inter' }, 'rose');
    // fontFamily('inter') → "Inter" stack
    expect(css).toMatch(/--font-heading:\s*"Inter"/);
  });

  it('merchant cardRadius overrides manifest', () => {
    const css = buildTokensCss({ cardRadius: 16 }, 'rose');
    expect(css).toContain('--radius-card: 16px');
  });

  it('merchant inputRadius overrides manifest', () => {
    const css = buildTokensCss({ inputRadius: 12 }, 'rose');
    expect(css).toContain('--radius-input: 12px');
  });

  it('merchant sectionPadding overrides manifest', () => {
    const css = buildTokensCss({ sectionPadding: 40 }, 'rose');
    expect(css).toContain('--section-padding: 40px');
    expect(css).toContain('--spacing-section-y: 40px');
  });

  it('merchant logoWidth overrides manifest', () => {
    const css = buildTokensCss({ logoWidth: 200 }, 'rose');
    expect(css).toContain('--size-logo-width: 200px');
  });

  it('merchant headingWeight overrides manifest', () => {
    const css = buildTokensCss({ headingWeight: 700 }, 'rose');
    expect(css).toContain('--weight-heading: 700');
  });

  it('zero buttonRadius from merchant respected (not falsy-coerced)', () => {
    // Important: typeof 0 === 'number' so merchantSet=true; 0 must win.
    const css = buildTokensCss({ buttonRadius: 0 }, 'rose');
    expect(css).toContain('--radius-button: 0px');
  });

  it('partial merchant settings: only set fields override; rest fall back', () => {
    const css = buildTokensCss({ buttonRadius: 24 }, 'rose');
    expect(css).toContain('--radius-button: 24px');
    // cardRadius not touched → manifest default 8px
    expect(css).toContain('--radius-card: 8px');
  });
});
