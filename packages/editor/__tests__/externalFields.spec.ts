import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createProductField,
  createCollectionField,
  type ExternalFieldConfig,
} from '../lib/externalFields';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockConfig: ExternalFieldConfig = {
  apiBaseUrl: 'https://api.example.com',
  shopId: 'shop_123',
};

function mockFetch(data: unknown) {
  return vi.fn().mockResolvedValue({
    json: () => Promise.resolve(data),
  });
}

// ---------------------------------------------------------------------------
// createProductField
// ---------------------------------------------------------------------------

describe('createProductField', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an external field type', () => {
    const field = createProductField(mockConfig);
    expect(field.type).toBe('external');
  });

  it('has label "Product"', () => {
    const field = createProductField(mockConfig);
    expect(field.label).toBe('Product');
  });

  it('fetchList calls correct URL with query and store_id', async () => {
    const fetchSpy = mockFetch({ products: [] });
    vi.stubGlobal('fetch', fetchSpy);

    const field = createProductField(mockConfig);
    await field.fetchList({ query: 'shoes' });

    const calledUrl = new URL(fetchSpy.mock.calls[0][0]);
    expect(calledUrl.pathname).toBe('/store/products/search');
    expect(calledUrl.searchParams.get('store_id')).toBe('shop_123');
    expect(calledUrl.searchParams.get('q')).toBe('shoes');
    expect(calledUrl.searchParams.get('limit')).toBe('20');
  });

  it('fetchList returns mapped products', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        products: [
          { id: 'p1', title: 'Sneakers', handle: 'sneakers' },
          { id: 'p2', title: 'Boots', handle: 'boots' },
        ],
      }),
    );

    const field = createProductField(mockConfig);
    const result = await field.fetchList({ query: '' });

    expect(result).toEqual([
      { id: 'p1', title: 'Sneakers', description: 'sneakers' },
      { id: 'p2', title: 'Boots', description: 'boots' },
    ]);
  });

  it('fetchList returns empty array when products is null/undefined', async () => {
    vi.stubGlobal('fetch', mockFetch({}));
    const field = createProductField(mockConfig);
    const result = await field.fetchList({ query: '' });
    expect(result).toEqual([]);
  });

  it('fetchList handles empty query', async () => {
    const fetchSpy = mockFetch({ products: [] });
    vi.stubGlobal('fetch', fetchSpy);

    const field = createProductField(mockConfig);
    await field.fetchList({ query: '' });

    const calledUrl = new URL(fetchSpy.mock.calls[0][0]);
    expect(calledUrl.searchParams.get('q')).toBe('');
  });

  it('mapRow returns item as-is', () => {
    const field = createProductField(mockConfig);
    const item = { id: 'p1', title: 'Sneakers' };
    expect(field.mapRow(item)).toBe(item);
  });

  it('getItemSummary returns title', () => {
    const field = createProductField(mockConfig);
    expect(field.getItemSummary({ id: 'p1', title: 'Sneakers' })).toBe('Sneakers');
  });

  it('getItemSummary falls back to id when no title', () => {
    const field = createProductField(mockConfig);
    expect(field.getItemSummary({ id: 'p1' })).toBe('p1');
  });
});

// ---------------------------------------------------------------------------
// createCollectionField
// ---------------------------------------------------------------------------

describe('createCollectionField', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an external field type', () => {
    const field = createCollectionField(mockConfig);
    expect(field.type).toBe('external');
  });

  it('has label "Collection"', () => {
    const field = createCollectionField(mockConfig);
    expect(field.label).toBe('Collection');
  });

  it('fetchList calls correct URL with store_id', async () => {
    const fetchSpy = mockFetch({ collections: [] });
    vi.stubGlobal('fetch', fetchSpy);

    const field = createCollectionField(mockConfig);
    await field.fetchList({ query: '' });

    const calledUrl = new URL(fetchSpy.mock.calls[0][0]);
    expect(calledUrl.pathname).toBe('/store/collections');
    expect(calledUrl.searchParams.get('store_id')).toBe('shop_123');
  });

  it('fetchList returns mapped collections', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        collections: [
          { id: 'c1', title: 'Summer', slug: 'summer' },
          { id: 'c2', title: 'Winter', slug: 'winter' },
        ],
      }),
    );

    const field = createCollectionField(mockConfig);
    const result = await field.fetchList({ query: '' });

    expect(result).toEqual([
      { id: 'c1', title: 'Summer', description: 'summer' },
      { id: 'c2', title: 'Winter', description: 'winter' },
    ]);
  });

  it('fetchList filters by query (case insensitive)', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        collections: [
          { id: 'c1', title: 'Summer Sale', slug: 'summer-sale' },
          { id: 'c2', title: 'Winter Sale', slug: 'winter-sale' },
        ],
      }),
    );

    const field = createCollectionField(mockConfig);
    const result = await field.fetchList({ query: 'winter' });

    expect(result).toEqual([
      { id: 'c2', title: 'Winter Sale', description: 'winter-sale' },
    ]);
  });

  it('fetchList returns empty array when collections is null/undefined', async () => {
    vi.stubGlobal('fetch', mockFetch({}));
    const field = createCollectionField(mockConfig);
    const result = await field.fetchList({ query: '' });
    expect(result).toEqual([]);
  });

  it('mapRow returns item as-is', () => {
    const field = createCollectionField(mockConfig);
    const item = { id: 'c1', title: 'Summer' };
    expect(field.mapRow(item)).toBe(item);
  });

  it('getItemSummary returns title', () => {
    const field = createCollectionField(mockConfig);
    expect(field.getItemSummary({ id: 'c1', title: 'Summer' })).toBe('Summer');
  });

  it('getItemSummary falls back to id when no title', () => {
    const field = createCollectionField(mockConfig);
    expect(field.getItemSummary({ id: 'c1' })).toBe('c1');
  });
});
