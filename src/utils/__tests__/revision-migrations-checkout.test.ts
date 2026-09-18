import { migrateRevisionData } from '../revision-migrations';

// Figma 1:19998 (2b78d47): checkout = 4 секции — CheckoutHeader / CheckoutForm
// (мега-блок: контакты+доставка+оплата+submit+terms) / CheckoutSummary
// (мега-блок: order summary + totals) / Footer.
describe('migrateCheckoutPage', () => {
  it('seeds Figma-canonical 4-block checkout when pagesData.checkout is missing', () => {
    const out = migrateRevisionData({ pagesData: { home: { content: [] } } });
    const checkout = (out.pagesData as Record<string, any>).checkout;
    expect(checkout).toBeDefined();
    const types = (checkout.content as Array<{ type: string }>).map((b) => b.type);
    expect(types).toEqual(['CheckoutHeader', 'CheckoutForm', 'CheckoutSummary', 'Footer']);
  });

  it('keeps page-checkout and checkout keys in sync', () => {
    const out = migrateRevisionData({ pagesData: { home: { content: [] } } });
    const pages = out.pagesData as Record<string, any>;
    expect(pages['page-checkout']).toEqual(pages['checkout']);
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

  it('collapses legacy 080 CheckoutLayout pages into the 4-block mega layout', () => {
    const customCheckout = {
      content: [{ type: 'CheckoutLayout', props: { id: 'X', summaryPosition: 'bottom' } }],
    };
    const out = migrateRevisionData({ pagesData: { checkout: customCheckout } });
    const checkout = (out.pagesData as Record<string, any>).checkout;
    const types = (checkout.content as Array<{ type: string }>).map((b) => b.type);
    expect(types).toEqual(['CheckoutHeader', 'CheckoutForm', 'CheckoutSummary', 'Footer']);
    expect(types).not.toContain('CheckoutLayout');
  });

  it('preserves existing Footer (no duplicate) when collapsing legacy layout', () => {
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
    expect(checkout.content[checkout.content.length - 1].props.id).toBe('F-keep');
  });

  it('already-consolidated page is a no-op (idempotent fast path)', () => {
    const consolidated = {
      content: [
        { type: 'CheckoutHeader', props: { id: 'H' } },
        { type: 'CheckoutForm', props: { id: 'mega-form' } },
        { type: 'CheckoutSummary', props: { id: 'mega-summary' } },
        { type: 'Footer', props: { id: 'F' } },
      ],
    };
    const out = migrateRevisionData({ pagesData: { checkout: consolidated } });
    const checkout = (out.pagesData as Record<string, any>).checkout;
    expect(checkout.content.map((b: any) => b.props.id)).toEqual([
      'H',
      'mega-form',
      'mega-summary',
      'F',
    ]);
  });

  it('b98: preserves the merchant colorScheme saved on page-checkout, not the stale checkout duplicate', () => {
    // Живой репро (18.09, Rose, siteId 53e9152f…): конструктор сохраняет
    // POST /revisions с обновлённым `page-checkout` (мерчант выбрал
    // "Схема 4"), но соседний дубликат `checkout` остаётся на старом
    // "scheme-checkout". Следующая загрузка (превью ИЛИ живая сборка) не
    // должна затирать свежую схему содержимым устаревшего дубликата.
    const stalePage = {
      content: [
        { type: 'CheckoutHeader', props: { id: 'CheckoutHeader-1' } },
        { type: 'CheckoutForm', props: { id: 'CheckoutForm-1', colorScheme: 'scheme-checkout' } },
        { type: 'CheckoutSummary', props: { id: 'CheckoutSummary-1', colorScheme: 'scheme-checkout' } },
        { type: 'Footer', props: { id: 'Footer-1' } },
      ],
    };
    const freshPage = {
      content: [
        { type: 'CheckoutHeader', props: { id: 'CheckoutHeader-1' } },
        { type: 'CheckoutForm', props: { id: 'CheckoutForm-1', colorScheme: 'scheme-4' } },
        { type: 'CheckoutSummary', props: { id: 'CheckoutSummary-1', colorScheme: 'scheme-checkout' } },
        { type: 'Footer', props: { id: 'Footer-1' } },
      ],
    };
    const out = migrateRevisionData({
      pagesData: { 'page-checkout': freshPage, checkout: stalePage },
    });
    const pages = out.pagesData as Record<string, any>;
    for (const key of ['page-checkout', 'checkout']) {
      const form = pages[key].content.find((b: any) => b.type === 'CheckoutForm');
      expect(form.props.colorScheme).toBe('scheme-4');
    }
    // Оба ключа держатся синхронизированными и после фикса — оба указывают
    // на СВЕЖИЙ page-checkout, а не наоборот.
    expect(pages['checkout']).toEqual(pages['page-checkout']);
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
