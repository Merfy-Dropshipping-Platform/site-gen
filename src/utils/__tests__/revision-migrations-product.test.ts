import { migrateRevisionData } from '../revision-migrations';

describe('migrateProductPage (via migrateRevisionData)', () => {
  it('seeds page-product when missing', () => {
    const data = { pagesData: { home: { content: [] } } } as Record<string, unknown>;
    const out = migrateRevisionData(data) as { pagesData: Record<string, any> };
    expect(out.pagesData['page-product']).toBeDefined();
    const content = out.pagesData['page-product'].content as Array<{ type: string }>;
    expect(content.find((b) => b.type === 'Product')).toBeDefined();
    expect(content.find((b) => b.type === 'PopularProducts')).toBeDefined();
    expect(content.find((b) => b.type === 'Newsletter')).toBeDefined();
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
