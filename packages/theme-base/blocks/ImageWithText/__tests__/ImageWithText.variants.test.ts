import {
  ImageWithTextSchema,
  ImageWithTextPuckConfig,
  ImageWithTextClasses,
} from '../index';

/**
 * 084 vanilla pilot — additive variant on ImageWithText:
 *   - ctaPosition: 'inline' | 'bottom-pinned'
 *
 * Verifies that the existing `imagePosition` enum still allows 'right'
 * (used by Vanilla home) — no regression there.
 */
describe('ImageWithText additive variants (084)', () => {
  const baseValid = {
    image: { url: 'https://x/y.jpg', alt: '' },
    padding: { top: 0, bottom: 0 },
  };

  it('schema accepts existing imagePosition="right" (regression check)', () => {
    expect(
      ImageWithTextSchema.safeParse({ ...baseValid, imagePosition: 'right' }).success,
    ).toBe(true);
  });

  it('schema accepts ctaPosition="bottom-pinned"', () => {
    expect(
      ImageWithTextSchema.safeParse({ ...baseValid, ctaPosition: 'bottom-pinned' }).success,
    ).toBe(true);
  });

  it('schema accepts ctaPosition="inline"', () => {
    expect(
      ImageWithTextSchema.safeParse({ ...baseValid, ctaPosition: 'inline' }).success,
    ).toBe(true);
  });

  it('schema rejects invalid ctaPosition', () => {
    expect(
      ImageWithTextSchema.safeParse({
        ...baseValid,
        ctaPosition: 'top' as unknown as 'inline',
      }).success,
    ).toBe(false);
  });

  it('schema works without ctaPosition (backwards compat)', () => {
    expect(ImageWithTextSchema.safeParse(baseValid).success).toBe(true);
  });

  it('PuckConfig exposes ctaPosition field', () => {
    const fields = ImageWithTextPuckConfig.fields as Record<string, unknown>;
    expect(fields.ctaPosition).toBeDefined();
  });

  it('Classes export ctaPosition mapping', () => {
    const c = ImageWithTextClasses as Record<string, unknown>;
    expect(c.ctaPosition).toBeDefined();
    const map = c.ctaPosition as Record<string, string>;
    expect(map.inline).toBeDefined();
    // bottom-pinned should pin CTA to the bottom of the text column
    expect(map['bottom-pinned']).toMatch(/mt-auto/);
  });
});
