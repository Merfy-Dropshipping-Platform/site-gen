import { migrateRevisionData } from '../revision-migrations';

describe('migrateCheckoutPage', () => {
  it('seeds default 11-block checkout when pagesData.checkout is missing', () => {
    const out = migrateRevisionData({ pagesData: { home: { content: [] } } });
    const checkout = (out.pagesData as Record<string, any>).checkout;
    expect(checkout).toBeDefined();
    const types = (checkout.content as Array<{ type: string }>).map((b) => b.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'CheckoutHeader',
        'CheckoutSummaryToggle',
        'CheckoutLayout',
        'CheckoutContactForm',
        'CheckoutDeliveryForm',
        'CheckoutDeliveryMethod',
        'CheckoutPayment',
        'CheckoutOrderSummary',
        'CheckoutTotals',
        'CheckoutSubmit',
        'CheckoutTerms',
      ]),
    );
    expect(checkout.content.length).toBeGreaterThanOrEqual(11);
  });

  it('is idempotent — running twice keeps the same shape', () => {
    const first = migrateRevisionData({ pagesData: { home: { content: [] } } });
    const second = migrateRevisionData(first);
    expect((second.pagesData as any).checkout).toEqual((first.pagesData as any).checkout);
  });

  it('does not overwrite existing checkout page that already has CheckoutLayout', () => {
    const customCheckout = {
      content: [{ type: 'CheckoutLayout', props: { id: 'X', summaryPosition: 'bottom' } }],
    };
    const out = migrateRevisionData({ pagesData: { checkout: customCheckout } });
    expect((out.pagesData as any).checkout).toEqual(customCheckout);
  });

  it('returns empty object for null/undefined input', () => {
    expect(migrateRevisionData(null)).toEqual({});
    expect(migrateRevisionData(undefined)).toEqual({});
  });
});
