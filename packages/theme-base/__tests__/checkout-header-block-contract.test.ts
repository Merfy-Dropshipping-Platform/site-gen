import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  CheckoutHeaderPuckConfig,
  CheckoutHeaderSchema,
  CheckoutHeaderTokens,
  CheckoutHeaderClasses,
} from '../blocks/CheckoutHeader';

describe('CheckoutHeader chrome block', () => {
  it('conforms to validateBlock', async () => {
    const dir = path.resolve(__dirname, '../blocks/CheckoutHeader');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('is singleton (maxInstances: 1)', () => {
    expect(CheckoutHeaderPuckConfig.maxInstances).toBe(1);
  });

  it('category is navigation', () => {
    expect(CheckoutHeaderPuckConfig.category).toBe('navigation');
  });

  it('schema parses a minimal valid props object', () => {
    const ok = CheckoutHeaderSchema.safeParse({
      siteTitle: 'Test Shop',
      colorScheme: 1,
      padding: { top: 24, bottom: 24 },
    });
    expect(ok.success).toBe(true);
  });

  it('tokens include container + hero heading size + bg', () => {
    expect(CheckoutHeaderTokens).toContain('--container-max-width');
    expect(CheckoutHeaderTokens).toContain('--size-hero-heading');
    expect(CheckoutHeaderTokens).toContain('--color-bg');
  });

  it('classes expose root + container + title', () => {
    expect(CheckoutHeaderClasses.root).toBeDefined();
    expect(CheckoutHeaderClasses.container).toBeDefined();
    expect(CheckoutHeaderClasses.title).toBeDefined();
  });
});
