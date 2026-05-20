import { migrateRevisionData } from '../revision-migrations';

describe('migrateCheckoutPage', () => {
  it('seeds default 12-block checkout (incl. Footer) when pagesData.checkout is missing', () => {
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
        'Footer',
      ]),
    );
    expect(checkout.content.length).toBeGreaterThanOrEqual(12);
    // CheckoutHeader must stay in front (checkout uses its own header variant)
    expect(types[0]).toBe('CheckoutHeader');
    // Footer last
    expect(types[types.length - 1]).toBe('Footer');
  });

  it('reuses Footer from home page when available', () => {
    const homeFooter = { type: 'Footer', props: { id: 'Footer-home' } };
    const out = migrateRevisionData({
      pagesData: {
        home: { content: [{ type: 'Header', props: {} }, homeFooter] },
      },
    });
    const checkout = (out.pagesData as Record<string, any>).checkout;
    expect(checkout.content[checkout.content.length - 1]).toBe(homeFooter);
  });

  it('appends Footer onto existing CheckoutLayout pages that lack it (094 backfill)', () => {
    const customCheckout = {
      content: [{ type: 'CheckoutLayout', props: { id: 'X', summaryPosition: 'bottom' } }],
    };
    const out = migrateRevisionData({ pagesData: { checkout: customCheckout } });
    const checkout = (out.pagesData as Record<string, any>).checkout;
    const types = (checkout.content as Array<{ type: string }>).map((b) => b.type);
    expect(types).toEqual(['CheckoutLayout', 'Footer']);
    // Original CheckoutLayout block preserved verbatim
    expect(checkout.content[0]).toBe(customCheckout.content[0]);
  });

  it('does not duplicate Footer if already present', () => {
    const customCheckout = {
      content: [
        { type: 'CheckoutLayout', props: { id: 'X' } },
        { type: 'Footer', props: { id: 'F-keep' } },
      ],
    };
    const out = migrateRevisionData({ pagesData: { checkout: customCheckout } });
    const checkout = (out.pagesData as Record<string, any>).checkout;
    const types = (checkout.content as Array<{ type: string }>).map((b) => b.type);
    expect(types.filter((t) => t === 'Footer')).toHaveLength(1);
    expect(checkout.content[1].props.id).toBe('F-keep');
  });

  it('is idempotent — running twice keeps the same shape', () => {
    const first = migrateRevisionData({ pagesData: { home: { content: [] } } });
    const second = migrateRevisionData(first);
    expect((second.pagesData as any).checkout).toEqual((first.pagesData as any).checkout);
  });

  it('returns empty object for null/undefined input', () => {
    expect(migrateRevisionData(null)).toEqual({});
    expect(migrateRevisionData(undefined)).toEqual({});
  });
});
