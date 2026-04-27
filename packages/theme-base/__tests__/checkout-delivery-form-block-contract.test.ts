import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  CheckoutDeliveryFormPuckConfig,
  CheckoutDeliveryFormSchema,
} from '../blocks/CheckoutDeliveryForm';

describe('CheckoutDeliveryForm block', () => {
  it('validateBlock', async () => {
    const r = await validateBlock(path.resolve(__dirname, '../blocks/CheckoutDeliveryForm'));
    expect(r.errors).toEqual([]); expect(r.ok).toBe(true);
  });
  it('PuckConfig fields', () => {
    expect(CheckoutDeliveryFormPuckConfig.label).toBe('Доставка');
    expect(CheckoutDeliveryFormPuckConfig.maxInstances).toBe(1);
    expect(CheckoutDeliveryFormPuckConfig.fields.country).toBeDefined();
    expect(CheckoutDeliveryFormPuckConfig.fields.cityDadata).toBeDefined();
    expect(CheckoutDeliveryFormPuckConfig.fields.requiredFields).toBeDefined();
  });
  it('Schema parses defaults', () => {
    const ok = CheckoutDeliveryFormSchema.safeParse({
      heading: 'Доставка',
      country: { enabled: true, default: 'РФ', selectable: false },
      nameField: { enabled: true, splitFirstLast: true },
      cityDadata: true, addressDadata: true, indexAutoFill: true,
      requiredFields: ['email', 'phone', 'name', 'city', 'address', 'index'],
      padding: { top: 0, bottom: 0 },
    });
    expect(ok.success).toBe(true);
  });
});
