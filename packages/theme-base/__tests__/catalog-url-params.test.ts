/**
 * Catalog URL params helper — pure parse/serialize logic test.
 *
 * Production behavior: Catalog.astro reads Astro.url.searchParams via
 * parseCatalogUrlParams() to derive collection/page/sort/availability/colors/price
 * filter state, and serializes back to URL via serializeCatalogUrlParams().
 *
 * This unit-tests the pure helper extracted from the .astro file. Defaults
 * round-trip to empty query (so canonical URL is /catalog without spurious params).
 */
import { parseCatalogUrlParams, serializeCatalogUrlParams, type CatalogUrlState } from '../blocks/Catalog/url-params';

describe('parseCatalogUrlParams', () => {
  it('returns defaults when query is empty', () => {
    const params = new URLSearchParams('');
    const result = parseCatalogUrlParams(params);
    expect(result).toEqual({
      collection: undefined,
      page: 1,
      sort: 'newest',
      availability: 'all',
      colors: [],
      priceMin: undefined,
      priceMax: undefined,
    });
  });

  it('parses collection from ?collection=URBAN', () => {
    const result = parseCatalogUrlParams(new URLSearchParams('collection=URBAN'));
    expect(result.collection).toBe('URBAN');
  });

  it('parses page=2 (clamped to >= 1)', () => {
    expect(parseCatalogUrlParams(new URLSearchParams('page=2')).page).toBe(2);
    expect(parseCatalogUrlParams(new URLSearchParams('page=0')).page).toBe(1);
    expect(parseCatalogUrlParams(new URLSearchParams('page=-5')).page).toBe(1);
    expect(parseCatalogUrlParams(new URLSearchParams('page=abc')).page).toBe(1);
  });

  it('parses sort from allowed values, falls back to newest', () => {
    expect(parseCatalogUrlParams(new URLSearchParams('sort=price-asc')).sort).toBe('price-asc');
    expect(parseCatalogUrlParams(new URLSearchParams('sort=price-desc')).sort).toBe('price-desc');
    expect(parseCatalogUrlParams(new URLSearchParams('sort=popularity')).sort).toBe('popularity');
    expect(parseCatalogUrlParams(new URLSearchParams('sort=newest')).sort).toBe('newest');
    expect(parseCatalogUrlParams(new URLSearchParams('sort=garbage')).sort).toBe('newest');
  });

  it('parses availability: in/out/all', () => {
    expect(parseCatalogUrlParams(new URLSearchParams('availability=in')).availability).toBe('in');
    expect(parseCatalogUrlParams(new URLSearchParams('availability=out')).availability).toBe('out');
    expect(parseCatalogUrlParams(new URLSearchParams('availability=garbage')).availability).toBe('all');
  });

  it('parses colors as comma-separated list', () => {
    expect(parseCatalogUrlParams(new URLSearchParams('color=red,blue')).colors).toEqual(['red', 'blue']);
    expect(parseCatalogUrlParams(new URLSearchParams('color=')).colors).toEqual([]);
    expect(parseCatalogUrlParams(new URLSearchParams('color=red, blue ,green')).colors).toEqual(['red', 'blue', 'green']);
  });

  it('parses priceMin and priceMax as numbers', () => {
    const r = parseCatalogUrlParams(new URLSearchParams('priceMin=100&priceMax=500'));
    expect(r.priceMin).toBe(100);
    expect(r.priceMax).toBe(500);
  });

  it('ignores invalid price values', () => {
    expect(parseCatalogUrlParams(new URLSearchParams('priceMin=abc')).priceMin).toBeUndefined();
    expect(parseCatalogUrlParams(new URLSearchParams('priceMin=-50')).priceMin).toBeUndefined();
  });
});

describe('serializeCatalogUrlParams', () => {
  it('produces empty string for default state', () => {
    const state: CatalogUrlState = {
      collection: undefined,
      page: 1,
      sort: 'newest',
      availability: 'all',
      colors: [],
      priceMin: undefined,
      priceMax: undefined,
    };
    expect(serializeCatalogUrlParams(state)).toBe('');
  });

  it('produces minimal query for non-default values', () => {
    const state: CatalogUrlState = {
      collection: 'URBAN',
      page: 2,
      sort: 'price-asc',
      availability: 'in',
      colors: ['red'],
      priceMin: 100,
      priceMax: 500,
    };
    const result = serializeCatalogUrlParams(state);
    expect(result).toContain('collection=URBAN');
    expect(result).toContain('page=2');
    expect(result).toContain('sort=price-asc');
    expect(result).toContain('availability=in');
    expect(result).toContain('color=red');
    expect(result).toContain('priceMin=100');
    expect(result).toContain('priceMax=500');
  });
});
