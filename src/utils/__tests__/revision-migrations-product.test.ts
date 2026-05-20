import { migrateRevisionData } from '../revision-migrations';

describe('migrateProductPage (via migrateRevisionData)', () => {
  it('seeds page-product wrapped with Header/Footer when missing', () => {
    const data = { pagesData: { home: { content: [] } } } as Record<string, unknown>;
    const out = migrateRevisionData(data) as { pagesData: Record<string, any> };
    expect(out.pagesData['page-product']).toBeDefined();
    const content = out.pagesData['page-product'].content as Array<{ type: string }>;
    expect(content[0].type).toBe('Header');
    expect(content[content.length - 1].type).toBe('Footer');
    expect(content.find((b) => b.type === 'Product')).toBeDefined();
    expect(content.find((b) => b.type === 'PopularProducts')).toBeDefined();
    expect(content.find((b) => b.type === 'Newsletter')).toBeDefined();
  });

  it('reuses Header/Footer from home page when available', () => {
    const homeHeader = { type: 'Header', props: { id: 'Header-home', siteTitle: 'My Shop' } };
    const homeFooter = { type: 'Footer', props: { id: 'Footer-home' } };
    const data = {
      pagesData: {
        home: { content: [homeHeader, { type: 'Hero', props: {} }, homeFooter] },
      },
    };
    const out = migrateRevisionData(data) as { pagesData: Record<string, any> };
    const content = out.pagesData['page-product'].content;
    expect(content[0]).toBe(homeHeader);
    expect(content[content.length - 1]).toBe(homeFooter);
  });

  it('patches Header/Footer onto existing pages that lack chrome (094 backfill)', () => {
    const data = {
      pagesData: {
        'page-product': {
          content: [
            { type: 'Product', props: { id: 'pre-094' } },
            { type: 'PopularProducts', props: {} },
            { type: 'Newsletter', props: {} },
          ],
        },
      },
    };
    const out = migrateRevisionData(data) as { pagesData: Record<string, any> };
    const types = (out.pagesData['page-product'].content as Array<{ type: string }>).map((b) => b.type);
    expect(types).toEqual(['Header', 'Product', 'PopularProducts', 'Newsletter', 'Footer']);
  });

  it('idempotent — does not duplicate Product block', () => {
    const data = {
      pagesData: {
        'page-product': {
          content: [
            { type: 'Header' },
            { type: 'Product', props: { id: 'Product-1' } },
            { type: 'Footer' },
          ],
        },
      },
    } as Record<string, unknown>;
    const out = migrateRevisionData(data) as { pagesData: Record<string, any> };
    const content = out.pagesData['page-product'].content as Array<{ type: string }>;
    const productBlocks = content.filter((b) => b.type === 'Product');
    expect(productBlocks).toHaveLength(1);
  });

  it('inserts Product before Footer when page-product exists без Product', () => {
    const data = {
      pagesData: {
        'page-product': {
          content: [{ type: 'Header' }, { type: 'Hero' }, { type: 'Footer' }],
        },
      },
    } as Record<string, unknown>;
    const out = migrateRevisionData(data) as { pagesData: Record<string, any> };
    const content = out.pagesData['page-product'].content as Array<{ type: string }>;
    const productIdx = content.findIndex((b) => b.type === 'Product');
    const footerIdx = content.findIndex((b) => b.type === 'Footer');
    expect(productIdx).toBeGreaterThan(0);
    expect(productIdx).toBeLessThan(footerIdx);
  });
});
