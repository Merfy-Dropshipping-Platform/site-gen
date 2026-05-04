import { FooterSchema, FooterPuckConfig, FooterClasses } from '../index';

/**
 * 084 vanilla pilot — additive variants on Footer (universal):
 *   - variant: new value `'2-part-asymmetric'` in existing enum
 *   - bottomStrip: new optional `{ enabled, text? }` object
 *
 * Default (`'minimal'` / `'3-col'` / `'2-part'`) preserves pre-084
 * rendering. New props are opt-in.
 */
describe('Footer additive variants (084)', () => {
  // Footer schema requires several nested objects — provide a minimal
  // "real-shape" baseline so the additive tests focus on the new fields.
  const baseValid = {
    newsletter: { enabled: false, heading: '', description: '', placeholder: '' },
    heading: { text: '', size: 'medium' as const, alignment: 'left' as const },
    text: { content: '', size: 'medium' as const },
    navigationColumn: { title: '', links: [] },
    informationColumn: { title: '', links: [] },
    socialColumn: { title: '', email: '', socialLinks: [] },
    padding: { top: 0, bottom: 0 },
  };

  it('schema accepts variant="2-part-asymmetric"', () => {
    expect(
      FooterSchema.safeParse({ ...baseValid, variant: '2-part-asymmetric' }).success,
    ).toBe(true);
  });

  it('schema still accepts pre-084 variants', () => {
    for (const v of ['3-col', '2-part', 'minimal'] as const) {
      expect(FooterSchema.safeParse({ ...baseValid, variant: v }).success).toBe(true);
    }
  });

  it('schema accepts bottomStrip with enabled+text', () => {
    expect(
      FooterSchema.safeParse({
        ...baseValid,
        bottomStrip: { enabled: true, text: 'Powered by Merfy' },
      }).success,
    ).toBe(true);
  });

  it('schema accepts bottomStrip without text', () => {
    expect(
      FooterSchema.safeParse({ ...baseValid, bottomStrip: { enabled: false } }).success,
    ).toBe(true);
  });

  it('schema rejects invalid variant', () => {
    expect(
      FooterSchema.safeParse({
        ...baseValid,
        variant: '4-col' as unknown as 'minimal',
      }).success,
    ).toBe(false);
  });

  it('schema works without variant or bottomStrip (backwards compat)', () => {
    expect(FooterSchema.safeParse(baseValid).success).toBe(true);
  });

  it('PuckConfig exposes bottomStrip field', () => {
    const fields = FooterPuckConfig.fields as Record<string, unknown>;
    expect(fields.bottomStrip).toBeDefined();
  });

  it('Classes export 2-part-asymmetric variant + bottomStrip mappings', () => {
    const c = FooterClasses as Record<string, unknown>;
    expect(c.variant).toBeDefined();
    const variantMap = c.variant as Record<string, { row: string; left: string; right: string }>;
    expect(variantMap['2-part-asymmetric']).toBeDefined();
    expect(variantMap['2-part-asymmetric'].right).toMatch(/items-end/);
    expect(c.bottomStrip).toBeDefined();
    const bs = c.bottomStrip as { wrapper: string; text: string };
    expect(bs.wrapper).toMatch(/bottom-strip-bg|bottom-strip/);
  });
});
