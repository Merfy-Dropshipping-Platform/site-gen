import { migrateRevisionData } from '../revision-migrations';

describe('migrateCartPage', () => {
  it('seeds default 3-block layout when page-cart missing', () => {
    const result = migrateRevisionData({ pagesData: {} }) as {
      pagesData: Record<string, any>;
    };
    const cart = result.pagesData['page-cart'];
    expect(cart).toBeDefined();
    expect(cart.content).toHaveLength(3);
    expect(cart.content[0].type).toBe('CartBody');
    expect(cart.content[1].type).toBe('CartSummary');
    expect(cart.content[2].type).toBe('Collections');
    expect(cart.content[2].props.heading).toBe('Возможно вам понравится');
  });

  it('is idempotent (running twice = no-op)', () => {
    const initial = { pagesData: {} };
    const first = migrateRevisionData(initial);
    const second = migrateRevisionData(first);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('leaves page-cart alone when CartBody already present', () => {
    const existing = {
      pagesData: {
        'page-cart': {
          content: [
            { type: 'CartBody', props: { id: 'custom-cart', colorScheme: 'scheme-2' } },
          ],
          root: { props: { title: 'Корзина' } },
          zones: {},
        },
      },
    };
    const result = migrateRevisionData(existing) as {
      pagesData: Record<string, any>;
    };
    expect(result.pagesData['page-cart'].content).toHaveLength(1);
    expect(result.pagesData['page-cart'].content[0].props.id).toBe('custom-cart');
  });

  it('inserts before Footer when page-cart exists without CartBody', () => {
    const existing = {
      pagesData: {
        'page-cart': {
          content: [
            { type: 'Header', props: {} },
            { type: 'Footer', props: {} },
          ],
          root: { props: {} },
          zones: {},
        },
      },
    };
    const result = migrateRevisionData(existing) as {
      pagesData: Record<string, any>;
    };
    const content = result.pagesData['page-cart'].content;
    expect(content).toHaveLength(5);
    expect(content[0].type).toBe('Header');
    expect(content[1].type).toBe('CartBody');
    expect(content[2].type).toBe('CartSummary');
    expect(content[3].type).toBe('Collections');
    expect(content[4].type).toBe('Footer');
  });

  it('appends when page-cart exists without Footer', () => {
    const existing = {
      pagesData: {
        'page-cart': {
          content: [{ type: 'Header', props: {} }],
          root: { props: {} },
          zones: {},
        },
      },
    };
    const result = migrateRevisionData(existing) as {
      pagesData: Record<string, any>;
    };
    const content = result.pagesData['page-cart'].content;
    expect(content).toHaveLength(4);
    expect(content[content.length - 1].type).toBe('Collections');
  });

  it('handles missing pagesData entirely', () => {
    const result = migrateRevisionData({}) as { pagesData?: Record<string, any> };
    expect(result.pagesData).toBeUndefined();
  });

  it('removes legacy CartSection when CartBody already present', () => {
    const existing = {
      pagesData: {
        'page-cart': {
          content: [
            { type: 'Header', props: {} },
            { type: 'CartSection', props: { id: 'legacy' } },
            { type: 'CartBody', props: { id: 'cart-body-1' } },
            { type: 'CartSummary', props: { id: 'cart-summary-1' } },
            { type: 'Footer', props: {} },
          ],
          root: { props: {} },
          zones: {},
        },
      },
    };
    const result = migrateRevisionData(existing) as {
      pagesData: Record<string, any>;
    };
    const types = result.pagesData['page-cart'].content.map((b: any) => b.type);
    expect(types).not.toContain('CartSection');
    expect(types).toEqual(['Header', 'CartBody', 'CartSummary', 'Footer']);
  });

  it('removes legacy CartSection AND inserts new blocks when CartBody missing', () => {
    const existing = {
      pagesData: {
        'page-cart': {
          content: [
            { type: 'Header', props: {} },
            { type: 'CartSection', props: { id: 'legacy' } },
            { type: 'Footer', props: {} },
          ],
          root: { props: {} },
          zones: {},
        },
      },
    };
    const result = migrateRevisionData(existing) as {
      pagesData: Record<string, any>;
    };
    const types = result.pagesData['page-cart'].content.map((b: any) => b.type);
    expect(types).not.toContain('CartSection');
    expect(types).toEqual(['Header', 'CartBody', 'CartSummary', 'Collections', 'Footer']);
  });

  it('preserves other pages (catalog, product) and seeds page-cart alongside', () => {
    const existing = {
      pagesData: {
        'page-catalog': {
          content: [{ type: 'Catalog', props: {} }],
          root: { props: {} },
          zones: {},
        },
      },
    };
    const result = migrateRevisionData(existing) as {
      pagesData: Record<string, any>;
    };
    expect(result.pagesData['page-catalog']).toBeDefined();
    expect(result.pagesData['page-cart']).toBeDefined();
  });
});
