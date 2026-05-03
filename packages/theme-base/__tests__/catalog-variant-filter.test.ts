import {
  applyCatalogFilters,
  detectColorOptions,
  type CatalogProduct,
} from '../blocks/Catalog/variant-filter';

const PRODUCTS: CatalogProduct[] = [
  { id: '1', name: 'Red Bag', basePrice: 100, quantity: 5, variants: [{ name: 'Цвет', value: 'red' }], collections: [{ id: 'urban' }], createdAt: '2026-05-01' },
  { id: '2', name: 'Blue Bag', basePrice: 200, quantity: 0, variants: [{ name: 'Цвет', value: 'blue' }], collections: [{ id: 'urban' }], createdAt: '2026-05-02' },
  { id: '3', name: 'Green Bag', basePrice: 150, quantity: 3, variants: [{ name: 'Цвет', value: 'green' }], collections: [{ id: 'riviera' }], createdAt: '2026-05-03' },
  { id: '4', name: 'Red Hat', basePrice: 50, quantity: 2, variants: [{ name: 'Цвет', value: 'red' }], collections: [], createdAt: '2026-04-30' },
];

describe('detectColorOptions', () => {
  it('extracts unique colors across products', () => {
    expect(detectColorOptions(PRODUCTS)).toEqual(expect.arrayContaining(['red', 'blue', 'green']));
    expect(detectColorOptions(PRODUCTS).length).toBe(3);
  });

  it('returns empty when no color variants', () => {
    expect(detectColorOptions([{ id: '1', name: 'X', basePrice: 1, quantity: 1, variants: [], collections: [], createdAt: '' }])).toEqual([]);
  });
});

describe('applyCatalogFilters', () => {
  it('returns all products with no filters', () => {
    const result = applyCatalogFilters(PRODUCTS, {
      collection: undefined, sort: 'newest', availability: 'all', colors: [], priceMin: undefined, priceMax: undefined,
    });
    expect(result.length).toBe(4);
  });

  it('filters by collection', () => {
    const result = applyCatalogFilters(PRODUCTS, {
      collection: 'urban', sort: 'newest', availability: 'all', colors: [], priceMin: undefined, priceMax: undefined,
    });
    expect(result.map((p) => p.id)).toEqual(expect.arrayContaining(['1', '2']));
    expect(result.length).toBe(2);
  });

  it('filters by availability=in (quantity > 0)', () => {
    const result = applyCatalogFilters(PRODUCTS, {
      collection: undefined, sort: 'newest', availability: 'in', colors: [], priceMin: undefined, priceMax: undefined,
    });
    expect(result.map((p) => p.id)).toEqual(expect.arrayContaining(['1', '3', '4']));
    expect(result.length).toBe(3);
  });

  it('filters by availability=out (quantity <= 0)', () => {
    const result = applyCatalogFilters(PRODUCTS, {
      collection: undefined, sort: 'newest', availability: 'out', colors: [], priceMin: undefined, priceMax: undefined,
    });
    expect(result.map((p) => p.id)).toEqual(['2']);
  });

  it('filters by colors (OR semantics — any matching color)', () => {
    const result = applyCatalogFilters(PRODUCTS, {
      collection: undefined, sort: 'newest', availability: 'all', colors: ['red', 'blue'], priceMin: undefined, priceMax: undefined,
    });
    expect(result.map((p) => p.id)).toEqual(expect.arrayContaining(['1', '2', '4']));
    expect(result.length).toBe(3);
  });

  it('filters by priceMin/priceMax range', () => {
    const result = applyCatalogFilters(PRODUCTS, {
      collection: undefined, sort: 'newest', availability: 'all', colors: [], priceMin: 100, priceMax: 200,
    });
    expect(result.map((p) => p.id)).toEqual(expect.arrayContaining(['1', '2', '3']));
    expect(result.length).toBe(3);
  });

  it('sorts by price-asc', () => {
    const result = applyCatalogFilters(PRODUCTS, {
      collection: undefined, sort: 'price-asc', availability: 'all', colors: [], priceMin: undefined, priceMax: undefined,
    });
    expect(result.map((p) => p.basePrice)).toEqual([50, 100, 150, 200]);
  });

  it('sorts by price-desc', () => {
    const result = applyCatalogFilters(PRODUCTS, {
      collection: undefined, sort: 'price-desc', availability: 'all', colors: [], priceMin: undefined, priceMax: undefined,
    });
    expect(result.map((p) => p.basePrice)).toEqual([200, 150, 100, 50]);
  });

  it('sorts by newest (createdAt desc)', () => {
    const result = applyCatalogFilters(PRODUCTS, {
      collection: undefined, sort: 'newest', availability: 'all', colors: [], priceMin: undefined, priceMax: undefined,
    });
    expect(result.map((p) => p.id)).toEqual(['3', '2', '1', '4']);
  });

  it('sorts by popularity (quantity desc as proxy)', () => {
    const result = applyCatalogFilters(PRODUCTS, {
      collection: undefined, sort: 'popularity', availability: 'all', colors: [], priceMin: undefined, priceMax: undefined,
    });
    expect(result.map((p) => p.quantity)).toEqual([5, 3, 2, 0]);
  });

  it('combines collection + colors + sort correctly', () => {
    const result = applyCatalogFilters(PRODUCTS, {
      collection: 'urban', sort: 'price-asc', availability: 'all', colors: ['red'], priceMin: undefined, priceMax: undefined,
    });
    expect(result.map((p) => p.id)).toEqual(['1']);
  });
});
