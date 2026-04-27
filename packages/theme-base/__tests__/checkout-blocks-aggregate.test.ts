import * as CheckoutHeader from '../blocks/CheckoutHeader';
import * as CheckoutLayout from '../blocks/CheckoutLayout';
import * as CheckoutSummaryToggle from '../blocks/CheckoutSummaryToggle';
import * as CheckoutContactForm from '../blocks/CheckoutContactForm';
import * as CheckoutDeliveryForm from '../blocks/CheckoutDeliveryForm';
import * as CheckoutDeliveryMethod from '../blocks/CheckoutDeliveryMethod';
import * as CheckoutPayment from '../blocks/CheckoutPayment';
import * as CheckoutOrderSummary from '../blocks/CheckoutOrderSummary';
import * as CheckoutTotals from '../blocks/CheckoutTotals';
import * as CheckoutSubmit from '../blocks/CheckoutSubmit';
import * as CheckoutTerms from '../blocks/CheckoutTerms';

const blocks = [
  ['CheckoutHeader', CheckoutHeader],
  ['CheckoutLayout', CheckoutLayout],
  ['CheckoutSummaryToggle', CheckoutSummaryToggle],
  ['CheckoutContactForm', CheckoutContactForm],
  ['CheckoutDeliveryForm', CheckoutDeliveryForm],
  ['CheckoutDeliveryMethod', CheckoutDeliveryMethod],
  ['CheckoutPayment', CheckoutPayment],
  ['CheckoutOrderSummary', CheckoutOrderSummary],
  ['CheckoutTotals', CheckoutTotals],
  ['CheckoutSubmit', CheckoutSubmit],
  ['CheckoutTerms', CheckoutTerms],
] as const;

describe('Checkout blocks aggregate', () => {
  it.each(blocks)('%s exports the required surface', (_name, mod: any) => {
    const cfg: any = Object.values(mod).find((v: any) => v?.label && v?.fields);
    expect(cfg).toBeDefined();
    expect(cfg.maxInstances).toBe(1);
    expect(cfg.fields.padding).toBeDefined();
    expect(cfg.defaults.padding).toBeDefined();
    expect(cfg.schema).toBeDefined();
  });

  it('all 11 blocks accept their default props through schema parse', () => {
    for (const [name, mod] of blocks) {
      const cfg: any = Object.values(mod).find((v: any) => v?.label && v?.fields);
      const result = cfg.schema.safeParse(cfg.defaults);
      expect({ name, ok: result.success, errors: result.success ? null : result.error.errors })
        .toMatchObject({ ok: true });
    }
  });
});
