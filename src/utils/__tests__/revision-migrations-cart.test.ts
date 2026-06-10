import { migrateRevisionData } from '../revision-migrations';

describe('migrateCartPage', () => {
  // Figma 1:20818 (c7da2c2): cart = 5 секций (CartBody/CartSummary/CartTotals/
  // CartCheckoutButton/PopularProducts) + chrome.
  it('seeds 5 cart blocks + chrome when page-cart missing', () => {
    const result = migrateRevisionData({ pagesData: {} }) as {
      pagesData: Record<string, any>;
    };
    const cart = result.pagesData['page-cart'];
    expect(cart).toBeDefined();
    expect(cart.content.map((b: any) => b.type)).toEqual([
      'Header',
      'CartBody',
      'CartSummary',
      'CartTotals',
      'CartCheckoutButton',
      'PopularProducts',
      'Footer',
    ]);
    expect(cart.content[5].props.heading).toBe('Возможно вам понравится');
  });

  it('reuses Header/Footer from home page when available', () => {
    const homeHeader = { type: 'Header', props: { id: 'Header-home', siteTitle: 'My Shop' } };
    const homeFooter = { type: 'Footer', props: { id: 'Footer-home' } };
    const result = migrateRevisionData({
      pagesData: {
        home: { content: [homeHeader, { type: 'Hero', props: {} }, homeFooter] },
      },
    }) as { pagesData: Record<string, any> };
    const content = result.pagesData['page-cart'].content;
    expect(content[0]).toBe(homeHeader);
    expect(content[content.length - 1]).toBe(homeFooter);
  });

  it('patches Header/Footer onto existing CartBody pages that lack chrome (094 backfill)', () => {
    const result = migrateRevisionData({
      pagesData: {
        'page-cart': {
          content: [
            { type: 'CartBody', props: { id: 'pre-094' } },
            { type: 'CartSummary', props: {} },
            { type: 'Collections', props: {} },
          ],
        },
      },
    }) as { pagesData: Record<string, any> };
    const types = result.pagesData['page-cart'].content.map((b: any) => b.type);
    // Кастомный Collections (без legacy-seed маркеров) сохраняется; патч
    // добавляет CartTotals + CartCheckoutButton после CartSummary.
    expect(types).toEqual([
      'Header',
      'CartBody',
      'CartSummary',
      'CartTotals',
      'CartCheckoutButton',
      'Collections',
      'Footer',
    ]);
  });

  it('is idempotent (running twice = no-op)', () => {
    const initial = { pagesData: {} };
    const first = migrateRevisionData(initial);
    const second = migrateRevisionData(first);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('keeps existing chromed page when CartBody already present', () => {
    const existing = {
      pagesData: {
        'page-cart': {
          content: [
            { type: 'Header', props: {} },
            { type: 'CartBody', props: { id: 'custom-cart', colorScheme: 'scheme-2' } },
            { type: 'Footer', props: {} },
          ],
          root: { props: { title: 'Корзина' } },
          zones: {},
        },
      },
    };
    const result = migrateRevisionData(existing) as {
      pagesData: Record<string, any>;
    };
    // Патч доставляет недостающие CartTotals/CartCheckoutButton (после
    // CartSummary; его нет — после Header), кастомный CartBody сохраняется.
    const content = result.pagesData['page-cart'].content;
    expect(content.map((b: any) => b.type)).toEqual([
      'Header',
      'CartTotals',
      'CartCheckoutButton',
      'CartBody',
      'Footer',
    ]);
    expect(content[3].props.id).toBe('custom-cart');
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
    expect(content.map((b: any) => b.type)).toEqual([
      'Header',
      'CartBody',
      'CartSummary',
      'CartTotals',
      'CartCheckoutButton',
      'PopularProducts',
      'Footer',
    ]);
  });

  it('adds Footer when page-cart exists without Footer', () => {
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
    expect(content).toHaveLength(7);
    expect(content[0].type).toBe('Header');
    expect(content[content.length - 1].type).toBe('Footer');
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
    expect(types).toEqual([
      'Header',
      'CartBody',
      'CartSummary',
      'CartTotals',
      'CartCheckoutButton',
      'Footer',
    ]);
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
    expect(types).toEqual([
      'Header',
      'CartBody',
      'CartSummary',
      'CartTotals',
      'CartCheckoutButton',
      'PopularProducts',
      'Footer',
    ]);
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
