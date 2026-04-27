import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  CheckoutOrderSummaryPuckConfig,
  CheckoutOrderSummarySchema,
} from '../blocks/CheckoutOrderSummary';

describe('CheckoutOrderSummary block', () => {
  it('validateBlock', async () => {
    const r = await validateBlock(path.resolve(__dirname, '../blocks/CheckoutOrderSummary'));
    expect(r.errors).toEqual([]); expect(r.ok).toBe(true);
  });
  it('PuckConfig fields', () => {
    expect(CheckoutOrderSummaryPuckConfig.fields.itemImageSize).toBeDefined();
    expect(CheckoutOrderSummaryPuckConfig.fields.promoToggle).toBeDefined();
    expect(CheckoutOrderSummaryPuckConfig.fields.bogoBadge).toBeDefined();
  });
  it('Schema parses defaults', () => {
    const ok = CheckoutOrderSummarySchema.safeParse({
      heading: 'X', itemImageSize: 'compact',
      showVariantLabels: true, showCompareAtPrice: true,
      promoToggle: { enabled: true, label: 'A', applyButtonText: 'B' },
      bogoBadge: true,
      padding: { top: 0, bottom: 0 },
    });
    expect(ok.success).toBe(true);
  });
});
