import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import { CheckoutTotalsPuckConfig, CheckoutTotalsSchema } from '../blocks/CheckoutTotals';

describe('CheckoutTotals block', () => {
  it('validateBlock', async () => {
    const r = await validateBlock(path.resolve(__dirname, '../blocks/CheckoutTotals'));
    expect(r.errors).toEqual([]); expect(r.ok).toBe(true);
  });
  it('PuckConfig fields', () => {
    expect(CheckoutTotalsPuckConfig.fields.deliveryLabel).toBeDefined();
    expect(CheckoutTotalsPuckConfig.fields.totalLabel).toBeDefined();
    expect(CheckoutTotalsPuckConfig.fields.showSubtotal).toBeDefined();
    expect(CheckoutTotalsPuckConfig.fields.showDiscount).toBeDefined();
  });
  it('Schema parses defaults', () => {
    const ok = CheckoutTotalsSchema.safeParse({
      deliveryLabel: 'Доставка', freeText: 'Бесплатно',
      totalLabel: 'Итого', showSubtotal: false, showDiscount: true,
      padding: { top: 0, bottom: 0 },
    });
    expect(ok.success).toBe(true);
  });
});
