import { migrateRevisionData } from '../revision-migrations';

describe('migrateCollectionPage', () => {
  it('adds page-collection if absent', () => {
    const result = migrateRevisionData({
      pagesData: { home: { content: [], root: {} } },
    }) as { pagesData: Record<string, any> };
    expect(result.pagesData['page-collection']).toBeDefined();
    expect(Array.isArray(result.pagesData['page-collection'].content)).toBe(true);
    expect(result.pagesData['page-collection'].content.length).toBeGreaterThanOrEqual(3);
  });

  it('preserves existing page-collection (idempotent)', () => {
    const existing = {
      content: [{ type: 'CustomBlock', props: { id: 'custom-1' } }],
      root: {},
    };
    const result = migrateRevisionData({
      pagesData: {
        home: { content: [], root: {} },
        'page-collection': existing,
      },
    }) as { pagesData: Record<string, any> };
    // Reference equality preserved — migration left the page untouched.
    expect(result.pagesData['page-collection']).toBe(existing);
  });

  it('seed contains Hero with template var heading and Catalog (auto-scoped)', () => {
    const result = migrateRevisionData({
      pagesData: { home: { content: [], root: {} } },
    }) as { pagesData: Record<string, any> };
    const types = result.pagesData['page-collection'].content.map((b: any) => b.type);
    expect(types).toContain('Hero');
    expect(types).toContain('Catalog');

    const hero = result.pagesData['page-collection'].content.find(
      (b: any) => b.type === 'Hero',
    );
    expect(hero.props.heading.text).toContain('{{COLLECTION_NAME}}');

    const catalog = result.pagesData['page-collection'].content.find(
      (b: any) => b.type === 'Catalog',
    );
    // collectionSlug omitted — live page auto-scopes from Astro.params.slug.
    expect(catalog.props.collectionSlug).toBeUndefined();
    expect(catalog.props.cards).toBe(24);
    expect(catalog.props.columns).toBe(3);
  });

  it('reuses Header/Footer from home page when available', () => {
    const homeHeader = { type: 'Header', props: { id: 'Header-home', siteTitle: 'My Shop' } };
    const homeFooter = { type: 'Footer', props: { id: 'Footer-home' } };
    const result = migrateRevisionData({
      pagesData: {
        home: {
          content: [homeHeader, { type: 'Hero', props: {} }, homeFooter],
          root: {},
        },
      },
    }) as { pagesData: Record<string, any> };
    const collContent = result.pagesData['page-collection'].content;
    expect(collContent[0]).toBe(homeHeader);
    expect(collContent[collContent.length - 1]).toBe(homeFooter);
  });

  it('falls back to default Header/Footer when home has none', () => {
    const result = migrateRevisionData({
      pagesData: { home: { content: [{ type: 'Hero', props: {} }], root: {} } },
    }) as { pagesData: Record<string, any> };
    const collContent = result.pagesData['page-collection'].content;
    expect(collContent[0].type).toBe('Header');
    expect(collContent[collContent.length - 1].type).toBe('Footer');
  });

  it('is idempotent — running twice produces identical output', () => {
    const initial = { pagesData: { home: { content: [], root: {} } } };
    const first = migrateRevisionData(initial);
    const second = migrateRevisionData(first);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
