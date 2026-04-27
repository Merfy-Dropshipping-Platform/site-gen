import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  CheckoutPaymentPuckConfig,
  CheckoutPaymentSchema,
} from '../blocks/CheckoutPayment';

describe('CheckoutPayment block', () => {
  it('validateBlock', async () => {
    const r = await validateBlock(path.resolve(__dirname, '../blocks/CheckoutPayment'));
    expect(r.errors).toEqual([]); expect(r.ok).toBe(true);
  });
  it('PuckConfig has methods array', () => {
    expect(CheckoutPaymentPuckConfig.fields.methods).toBeDefined();
    expect(CheckoutPaymentPuckConfig.fields.cardForm).toBeDefined();
    expect(CheckoutPaymentPuckConfig.defaults.methods.length).toBeGreaterThanOrEqual(4);
  });
  it('Schema accepts default methods set', () => {
    const ok = CheckoutPaymentSchema.safeParse({
      heading: 'Платёжная система', subheading: 'X',
      methods: [
        { key: 'bank_card', enabled: true, label: 'Карта' },
        { key: 'sbp', enabled: true, label: 'СБП' },
        { key: 'sberbank', enabled: false, label: 'Sber' },
        { key: 'tinkoff_bank', enabled: false, label: 'T' },
      ],
      cardForm: { cvvHelpEnabled: true, nameOnCardEnabled: true, warningText: '.' },
      padding: { top: 0, bottom: 0 },
    });
    expect(ok.success).toBe(true);
  });
  it('Schema rejects unknown method key', () => {
    const fail = CheckoutPaymentSchema.safeParse({
      heading: 'X', subheading: 'Y',
      methods: [{ key: 'paypal', enabled: true, label: 'X' }],
      cardForm: { cvvHelpEnabled: false, nameOnCardEnabled: false, warningText: '' },
      padding: { top: 0, bottom: 0 },
    });
    expect(fail.success).toBe(false);
  });
});
