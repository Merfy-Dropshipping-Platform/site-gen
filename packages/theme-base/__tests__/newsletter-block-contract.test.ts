import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  NewsletterPuckConfig,
  NewsletterSchema,
  NewsletterTokens,
  NewsletterClasses,
} from '../blocks/Newsletter';

describe('Newsletter block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/Newsletter');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports NewsletterPuckConfig with required fields', () => {
    expect(NewsletterPuckConfig.label).toBe('Подписка');
    expect(NewsletterPuckConfig.category).toBe('form');
    expect(NewsletterPuckConfig.defaults.buttonText).toBeDefined();
  });

  it('NewsletterSchema parses valid props', () => {
    const ok = NewsletterSchema.safeParse({
      heading: 'Subscribe',
      description: 'Get updates',
      placeholder: 'email',
      buttonText: 'Go',
      colorScheme: 1,
      padding: { top: 40, bottom: 40 },
    });
    expect(ok.success).toBe(true);
  });

  it('NewsletterTokens lists form width token', () => {
    expect(NewsletterTokens.length).toBeGreaterThan(0);
    expect(NewsletterTokens).toContain('--size-newsletter-form-w');
  });

  it('NewsletterClasses has root + container + form', () => {
    expect(NewsletterClasses.root).toBeDefined();
    expect(NewsletterClasses.container).toBeDefined();
    expect(NewsletterClasses.form).toBeDefined();
  });
});
