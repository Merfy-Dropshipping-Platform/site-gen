import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  CheckoutHeaderPuckConfig,
  CheckoutHeaderSchema,
  CheckoutHeaderTokens,
  CheckoutHeaderClasses,
} from '../blocks/CheckoutHeader';

describe('CheckoutHeader block', () => {
  it('conforms to validateBlock contract', async () => {
    const dir = path.resolve(__dirname, '../blocks/CheckoutHeader');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('exports PuckConfig with refactored fields', () => {
    expect(CheckoutHeaderPuckConfig.label).toBe('Шапка оформления');
    expect(CheckoutHeaderPuckConfig.category).toBe('navigation');
    expect(CheckoutHeaderPuckConfig.maxInstances).toBe(1);
    expect(CheckoutHeaderPuckConfig.fields.logoMode).toBeDefined();
    expect(CheckoutHeaderPuckConfig.fields.rightIcon).toBeDefined();
    expect(CheckoutHeaderPuckConfig.fields.accountLink).toBeDefined();
  });

  it('Schema parses extended props', () => {
    const ok = CheckoutHeaderSchema.safeParse({
      siteTitle: 'Test Shop',
      logoMode: 'text',
      logoImage: null,
      rightIcon: 'account',
      accountLink: '/account',
      backLink: '/cart',
      padding: { top: 24, bottom: 24 },
    });
    expect(ok.success).toBe(true);
  });

  it('Schema rejects invalid logoMode', () => {
    const fail = CheckoutHeaderSchema.safeParse({
      siteTitle: 'X',
      logoMode: 'invalid',
      rightIcon: 'account',
      accountLink: '/',
      backLink: '/cart',
      padding: { top: 0, bottom: 0 },
    });
    expect(fail.success).toBe(false);
  });

  it('exposes backLink field with /cart default', () => {
    expect(CheckoutHeaderPuckConfig.fields.backLink).toBeDefined();
    expect(CheckoutHeaderPuckConfig.defaults.backLink).toBe('/cart');
  });

  it('Tokens lists at least one CSS var', () => {
    expect(CheckoutHeaderTokens.length).toBeGreaterThan(0);
    expect(CheckoutHeaderTokens).toContain('--color-bg');
  });

  it('Classes export has root + container + brand + iconRight', () => {
    expect(CheckoutHeaderClasses.root).toBeDefined();
    expect(CheckoutHeaderClasses.container).toBeDefined();
    expect(CheckoutHeaderClasses.brand).toBeDefined();
    expect(CheckoutHeaderClasses.iconRight).toBeDefined();
  });
});
