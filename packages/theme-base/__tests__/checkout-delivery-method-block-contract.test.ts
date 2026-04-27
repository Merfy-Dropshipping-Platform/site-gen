import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  CheckoutDeliveryMethodPuckConfig,
  CheckoutDeliveryMethodSchema,
} from '../blocks/CheckoutDeliveryMethod';

describe('CheckoutDeliveryMethod block', () => {
  it('validateBlock', async () => {
    const r = await validateBlock(path.resolve(__dirname, '../blocks/CheckoutDeliveryMethod'));
    expect(r.errors).toEqual([]); expect(r.ok).toBe(true);
  });
  it('PuckConfig has CDEK + pickup + custom', () => {
    expect(CheckoutDeliveryMethodPuckConfig.fields.cdekEnabled).toBeDefined();
    expect(CheckoutDeliveryMethodPuckConfig.fields.pickupEnabled).toBeDefined();
    expect(CheckoutDeliveryMethodPuckConfig.fields.customMethods).toBeDefined();
    expect(CheckoutDeliveryMethodPuckConfig.fields.freeShippingThresholdCents).toBeDefined();
  });
  it('Schema accepts customMethods array', () => {
    const ok = CheckoutDeliveryMethodSchema.safeParse({
      heading: 'X', cdekEnabled: true, cdekDoorLabel: 'A', cdekPvzLabel: 'B',
      pickupEnabled: false, pickupLabel: 'P',
      customMethods: [{ label: 'Boxberry', priceCents: 39900, etaText: '5-7 дней' }],
      freeShippingThresholdCents: null,
      padding: { top: 0, bottom: 0 },
    });
    expect(ok.success).toBe(true);
  });
});
