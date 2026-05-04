import {
  NewsletterSchema,
  NewsletterPuckConfig,
  NewsletterClasses,
} from '../index';

/**
 * 084 vanilla pilot — additive variant: Newsletter.formLayout.
 *   - 'stacked'        : button below input (block layout)
 *   - 'inline-submit'  : pre-084 default (button absolute over input)
 * Default is unset → identical pre-commit (inline-submit appearance).
 */
describe('Newsletter.formLayout (additive variant)', () => {
  const baseValid = {
    placeholder: 'email',
    buttonText: 'go',
    padding: { top: 0, bottom: 0 },
  };

  it('schema accepts formLayout="stacked"', () => {
    expect(
      NewsletterSchema.safeParse({ ...baseValid, formLayout: 'stacked' }).success,
    ).toBe(true);
  });

  it('schema accepts formLayout="inline-submit"', () => {
    expect(
      NewsletterSchema.safeParse({ ...baseValid, formLayout: 'inline-submit' }).success,
    ).toBe(true);
  });

  it('schema rejects invalid formLayout', () => {
    expect(
      NewsletterSchema.safeParse({
        ...baseValid,
        formLayout: 'card' as unknown as 'stacked',
      }).success,
    ).toBe(false);
  });

  it('schema works without formLayout (backwards compat)', () => {
    expect(NewsletterSchema.safeParse(baseValid).success).toBe(true);
  });

  it('PuckConfig exposes formLayout field', () => {
    const fields = NewsletterPuckConfig.fields as Record<string, unknown>;
    expect(fields.formLayout).toBeDefined();
  });

  it('Classes export formWrapper mapping with both variants', () => {
    const c = NewsletterClasses as Record<string, unknown>;
    expect(c.formWrapper).toBeDefined();
    const map = c.formWrapper as Record<string, string>;
    expect(map.stacked).toBeDefined();
    expect(map['inline-submit']).toMatch(/relative/);
  });
});
