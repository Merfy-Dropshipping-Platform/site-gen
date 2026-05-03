import { migrateRevisionData } from '../revision-migrations';

describe('migrateCatalogPage', () => {
  it('seeds page-catalog with single Catalog block when missing entirely', () => {
    const result = migrateRevisionData({ pagesData: {} }) as {
      pagesData: Record<string, any>;
    };
    const catalog = result.pagesData['page-catalog'];
    expect(catalog).toBeDefined();
    expect(catalog.content).toHaveLength(1);
    expect(catalog.content[0].type).toBe('Catalog');
  });

  it('is idempotent (running twice = no-op)', () => {
    const initial = {
      pagesData: {
        'page-catalog': {
          content: [
            { type: 'Header', props: {} },
            { type: 'PopularProducts', props: {} },
            { type: 'Footer', props: {} },
          ],
        },
      },
    };
    const first = migrateRevisionData(initial);
    const second = migrateRevisionData(first);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('replaces legacy [Header, PopularProducts, Footer] seed with Catalog', () => {
    const result = migrateRevisionData({
      pagesData: {
        'page-catalog': {
          content: [
            { type: 'Header', props: {} },
            { type: 'PopularProducts', props: {} },
            { type: 'Footer', props: {} },
          ],
        },
      },
    }) as { pagesData: Record<string, any> };
    const types = result.pagesData['page-catalog'].content.map((b: any) => b.type);
    expect(types).toEqual(['Header', 'Catalog', 'Footer']);
  });

  it('leaves customised page alone — no auto-Catalog when user has Hero+Collections+PopularProducts+Gallery', () => {
    const customised = {
      pagesData: {
        'page-catalog': {
          content: [
            { type: 'PromoBanner', props: {} },
            { type: 'Header', props: {} },
            { type: 'Hero', props: {} },
            { type: 'Collections', props: {} },
            { type: 'PopularProducts', props: {} },
            { type: 'Gallery', props: {} },
            { type: 'Footer', props: {} },
          ],
        },
      },
    };
    const result = migrateRevisionData(customised) as { pagesData: Record<string, any> };
    const types = result.pagesData['page-catalog'].content.map((b: any) => b.type);
    expect(types).toEqual([
      'PromoBanner',
      'Header',
      'Hero',
      'Collections',
      'PopularProducts',
      'Gallery',
      'Footer',
    ]);
    expect(types).not.toContain('Catalog');
  });

  it('leaves customised page alone — even if it has just one extra block beyond legacy seed', () => {
    const customised = {
      pagesData: {
        'page-catalog': {
          content: [
            { type: 'Header', props: {} },
            { type: 'Hero', props: {} },
            { type: 'PopularProducts', props: {} },
            { type: 'Footer', props: {} },
          ],
        },
      },
    };
    const result = migrateRevisionData(customised) as { pagesData: Record<string, any> };
    const types = result.pagesData['page-catalog'].content.map((b: any) => b.type);
    expect(types).toEqual(['Header', 'Hero', 'PopularProducts', 'Footer']);
    expect(types).not.toContain('Catalog');
  });

  it('leaves page alone when Catalog already present', () => {
    const result = migrateRevisionData({
      pagesData: {
        'page-catalog': {
          content: [
            { type: 'Header', props: {} },
            { type: 'Catalog', props: { id: 'my-custom-catalog' } },
            { type: 'Footer', props: {} },
          ],
        },
      },
    }) as { pagesData: Record<string, any> };
    expect(result.pagesData['page-catalog'].content[1].props.id).toBe('my-custom-catalog');
  });
});
