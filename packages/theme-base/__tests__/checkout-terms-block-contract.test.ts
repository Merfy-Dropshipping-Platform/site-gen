import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import { CheckoutTermsPuckConfig, CheckoutTermsSchema } from '../blocks/CheckoutTerms';

describe('CheckoutTerms block', () => {
  it('validateBlock', async () => {
    const r = await validateBlock(path.resolve(__dirname, '../blocks/CheckoutTerms'));
    expect(r.errors).toEqual([]); expect(r.ok).toBe(true);
  });
  it('PuckConfig fields', () => {
    expect(CheckoutTermsPuckConfig.fields.text).toBeDefined();
    expect(CheckoutTermsPuckConfig.fields.links).toBeDefined();
  });
  it('Schema accepts links array', () => {
    const ok = CheckoutTermsSchema.safeParse({
      text: 'Размещая заказ…',
      links: [{ label: 'Условия', url: '/legal/terms' }],
      padding: { top: 0, bottom: 0 },
    });
    expect(ok.success).toBe(true);
  });
});
