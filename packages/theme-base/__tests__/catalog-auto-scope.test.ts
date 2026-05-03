import { resolveCatalogScope } from '../blocks/Catalog/auto-scope';

describe('resolveCatalogScope', () => {
  it('returns explicit collectionSlug when set (highest priority)', () => {
    expect(resolveCatalogScope({
      explicitCollectionSlug: 'URBAN',
      routeSlug: 'riviera',
      urlQueryCollection: 'flux',
    })).toBe('URBAN');
  });

  it('falls back to routeSlug when explicit not set', () => {
    expect(resolveCatalogScope({
      explicitCollectionSlug: undefined,
      routeSlug: 'riviera',
      urlQueryCollection: 'flux',
    })).toBe('riviera');
  });

  it('falls back to urlQueryCollection when explicit + route both empty', () => {
    expect(resolveCatalogScope({
      explicitCollectionSlug: undefined,
      routeSlug: undefined,
      urlQueryCollection: 'flux',
    })).toBe('flux');
  });

  it('returns undefined when all sources empty', () => {
    expect(resolveCatalogScope({
      explicitCollectionSlug: undefined,
      routeSlug: undefined,
      urlQueryCollection: undefined,
    })).toBeUndefined();
  });

  it('treats empty strings as undefined', () => {
    expect(resolveCatalogScope({
      explicitCollectionSlug: '',
      routeSlug: '',
      urlQueryCollection: '',
    })).toBeUndefined();
  });

  it('trims whitespace', () => {
    expect(resolveCatalogScope({
      explicitCollectionSlug: '  URBAN  ',
      routeSlug: undefined,
      urlQueryCollection: undefined,
    })).toBe('URBAN');
  });

  it('skips _placeholder routeSlug (used by getStaticPaths fallback)', () => {
    expect(resolveCatalogScope({
      explicitCollectionSlug: undefined,
      routeSlug: '_placeholder',
      urlQueryCollection: 'flux',
    })).toBe('flux');
  });
});
