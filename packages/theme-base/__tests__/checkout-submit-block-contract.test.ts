import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import { CheckoutSubmitPuckConfig, CheckoutSubmitSchema } from '../blocks/CheckoutSubmit';

describe('CheckoutSubmit block', () => {
  it('validateBlock', async () => {
    const r = await validateBlock(path.resolve(__dirname, '../blocks/CheckoutSubmit'));
    expect(r.errors).toEqual([]); expect(r.ok).toBe(true);
  });
  it('PuckConfig fields', () => {
    expect(CheckoutSubmitPuckConfig.fields.buttonText).toBeDefined();
    expect(CheckoutSubmitPuckConfig.fields.buttonStyle).toBeDefined();
    expect(CheckoutSubmitPuckConfig.fields.successRedirectUrl).toBeDefined();
  });
  it('Schema parses defaults', () => {
    const ok = CheckoutSubmitSchema.safeParse({
      buttonText: 'Оплатить {total}', buttonStyle: 'fill',
      loadingText: 'Обработка платежа…', successRedirectUrl: '/checkout-result',
      padding: { top: 0, bottom: 0 },
    });
    expect(ok.success).toBe(true);
  });
});
