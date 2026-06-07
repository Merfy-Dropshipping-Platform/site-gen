import { getPageResolver } from '../themes/page-resolver-instance';

describe('sites multipage integration', () => {
  it('PageResolver for rose buildInitialRevision returns 8 system pages', async () => {
    const resolver = getPageResolver('rose');
    const rev = await resolver.buildInitialRevision();
    expect(rev.pages).toHaveLength(8);
    expect(rev.pages.map((p) => p.id).sort()).toEqual(
      [
        'home',
        'page-about',
        'page-cart',
        'page-catalog',
        'page-checkout',
        'page-collection',
        'page-contacts',
        'page-product',
      ].sort(),
    );
  });

  it('pagesData contains content for all 8 pages', async () => {
    const resolver = getPageResolver('rose');
    const rev = await resolver.buildInitialRevision();
    expect(Object.keys(rev.pagesData)).toHaveLength(8);
    for (const id of rev.pages.map((p) => p.id)) {
      expect(rev.pagesData[id]).toBeDefined();
      expect(rev.pagesData[id].content).toBeInstanceOf(Array);
    }
  });

  it('home is currentPageId', async () => {
    const resolver = getPageResolver('rose');
    const rev = await resolver.buildInitialRevision();
    expect(rev.currentPageId).toBe('home');
  });

  it('normalizeRevision on legacy revision adds missing system pages', async () => {
    const resolver = getPageResolver('rose');
    const legacy = {
      pages: [{ id: 'home', name: 'Главная', slug: '/', role: 'system' }],
      pagesData: { home: { content: [], root: { props: {} }, zones: {} } },
    };
    const normalized = resolver.normalizeRevision(legacy);
    expect(normalized.pages).toHaveLength(8);
    expect(normalized.themeId).toBe('rose');
  });
});
