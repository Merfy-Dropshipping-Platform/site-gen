import {
  PromoBannerSchema,
  PromoBannerPuckConfig,
  PromoBannerClasses,
} from '../index';

/**
 * 084 vanilla pilot — additive variants on PromoBanner:
 *   - size: 'thin' (new value in existing enum)
 *   - textTransform: 'none' | 'uppercase' (new field)
 *
 * Default (no extra props) → identical pre-commit. Existing values
 * (small/medium/large) remain valid.
 */
describe('PromoBanner additive variants (084)', () => {
  const baseValid = {
    text: 'free shipping',
    padding: { top: 0, bottom: 0 },
  };

  it('schema accepts size="thin"', () => {
    expect(PromoBannerSchema.safeParse({ ...baseValid, size: 'thin' }).success).toBe(true);
  });

  it('schema still accepts pre-084 sizes (small/medium/large)', () => {
    for (const s of ['small', 'medium', 'large'] as const) {
      expect(PromoBannerSchema.safeParse({ ...baseValid, size: s }).success).toBe(true);
    }
  });

  it('schema accepts textTransform="uppercase"', () => {
    expect(
      PromoBannerSchema.safeParse({ ...baseValid, textTransform: 'uppercase' }).success,
    ).toBe(true);
  });

  it('schema accepts textTransform="none"', () => {
    expect(
      PromoBannerSchema.safeParse({ ...baseValid, textTransform: 'none' }).success,
    ).toBe(true);
  });

  it('schema rejects invalid textTransform', () => {
    expect(
      PromoBannerSchema.safeParse({
        ...baseValid,
        textTransform: 'capitalize' as unknown as 'none',
      }).success,
    ).toBe(false);
  });

  it('schema works without new variants (backwards compat)', () => {
    expect(PromoBannerSchema.safeParse(baseValid).success).toBe(true);
  });

  it('PuckConfig exposes textTransform field and thin option', () => {
    const fields = PromoBannerPuckConfig.fields as Record<string, unknown>;
    expect(fields.textTransform).toBeDefined();
    const sizeField = fields.size as { options?: Array<{ value: string }> };
    const values = sizeField?.options?.map((o) => o.value) ?? [];
    expect(values).toContain('thin');
  });

  it('Classes export size mapping including "thin"', () => {
    const c = PromoBannerClasses as Record<string, unknown>;
    expect(c.size).toBeDefined();
    const map = c.size as Record<string, string>;
    expect(map.thin).toBeDefined();
  });

  it('Classes export textTransform mapping', () => {
    const c = PromoBannerClasses as Record<string, unknown>;
    expect(c.textTransform).toBeDefined();
    const map = c.textTransform as Record<string, string>;
    expect(map.uppercase).toMatch(/uppercase/);
    expect(map.none).toBeDefined();
  });
});
