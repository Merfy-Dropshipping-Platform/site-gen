import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  CheckoutContactFormPuckConfig,
  CheckoutContactFormSchema,
  CheckoutContactFormTokens,
  CheckoutContactFormClasses,
} from '../blocks/CheckoutContactForm';

describe('CheckoutContactForm block', () => {
  it('validateBlock contract', async () => {
    const r = await validateBlock(path.resolve(__dirname, '../blocks/CheckoutContactForm'));
    expect(r.errors).toEqual([]); expect(r.ok).toBe(true);
  });
  it('PuckConfig fields', () => {
    expect(CheckoutContactFormPuckConfig.label).toBe('Контакты');
    expect(CheckoutContactFormPuckConfig.maxInstances).toBe(1);
    expect(CheckoutContactFormPuckConfig.fields.showAuthLink).toBeDefined();
    expect(CheckoutContactFormPuckConfig.fields.phoneFormat).toBeDefined();
  });
  it('Schema rejects invalid phoneFormat', () => {
    const fail = CheckoutContactFormSchema.safeParse({
      heading: 'Контакты', showAuthLink: true, authLinkText: 'X', authLinkHref: '/x',
      emailLabel: 'E', phoneLabel: 'P', phoneFormat: 'unknown',
      padding: { top: 0, bottom: 0 },
    });
    expect(fail.success).toBe(false);
  });
  it('Tokens + Classes', () => {
    expect(CheckoutContactFormTokens).toContain('--color-input-bg');
    expect(CheckoutContactFormClasses.field).toBeDefined();
    expect(CheckoutContactFormClasses.label).toBeDefined();
  });
});
