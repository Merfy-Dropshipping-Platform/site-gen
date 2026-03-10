import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { MockStoreProvider, useStoreConfig } from '../testing/MockStoreProvider';
import { mockProducts } from '../testing/mock-data/products';
import { mockCollections } from '../testing/mock-data/collections';
import { useProducts } from '../hooks/useProducts';
import { useProduct } from '../hooks/useProduct';
import { useSearch } from '../hooks/useSearch';
import type { Product, StoreConfig } from '../types';

function createMockWrapper(overrides?: {
  config?: Partial<StoreConfig>;
  products?: Product[];
}) {
  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <MockStoreProvider
        config={overrides?.config}
        products={overrides?.products}
      >
        {children}
      </MockStoreProvider>
    );
  };
}

describe('MockStoreProvider (US6)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // T055: useProducts via MockStoreProvider: returns 50+ mock products without real API
  it('T055: useProducts returns 50+ mock products without real API calls', async () => {
    const wrapper = createMockWrapper();

    const { result } = renderHook(
      () => useProducts({ limit: 100 }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should return 50+ products
    expect(result.current.data.length).toBeGreaterThanOrEqual(50);
    expect(result.current.total).toBeGreaterThanOrEqual(50);
  });

  // T056: useProduct("cotton-tee"): returns mock product
  it('T056: useProduct("cotton-tee") returns the mock product data', async () => {
    const wrapper = createMockWrapper();
    const { result } = renderHook(() => useProduct('cotton-tee'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeDefined();
    expect(result.current.data?.handle).toBe('cotton-tee');
    expect(result.current.data?.title).toContain('\u0425\u043b\u043e\u043f\u043a\u043e\u0432\u0430\u044f'); // "Хлопковая"
    expect(result.current.data?.price).toBe(299000);
  });

  // T057: useSearch with query="футболка": filters by title/description
  it('T057: useSearch with query filters mock products by title/description', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const wrapper = createMockWrapper();
    const { result } = renderHook(() => useSearch(), { wrapper });

    act(() => {
      result.current.setQuery('\u0444\u0443\u0442\u0431\u043e\u043b\u043a\u0430'); // "футболка"
    });

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(result.current.results.length).toBeGreaterThan(0);
    });

    // All results should match "футболка" in title or description
    for (const product of result.current.results) {
      const matchesTitle = product.title.toLowerCase().includes('\u0444\u0443\u0442\u0431\u043e\u043b\u043a\u0430');
      const matchesDescription = product.description?.toLowerCase().includes('\u0444\u0443\u0442\u0431\u043e\u043b\u043a\u0430') ?? false;
      expect(matchesTitle || matchesDescription).toBe(true);
    }
  });

  // T058: partial config override: currency="USD"
  it('T058: partial config override changes currency to USD', () => {
    function ConfigWrapper({ children }: { children: React.ReactNode }) {
      return (
        <MockStoreProvider config={{ currency: 'USD' }}>
          {children}
        </MockStoreProvider>
      );
    }

    const { result } = renderHook(() => useStoreConfig(), { wrapper: ConfigWrapper });

    expect(result.current.currency).toBe('USD');
    // Other defaults should remain
    expect(result.current.storeId).toBe('mock-store-1');
    expect(result.current.locale).toBe('ru-RU');
  });

  // T059: custom products override
  it('T059: custom products array overrides default mock products', async () => {
    const customProducts: Product[] = [
      {
        id: 'custom_1',
        handle: 'custom-product',
        title: 'Custom Product',
        price: 100,
        images: [],
        variants: [{ id: 'cv_1', title: 'Default', price: 100, available: true }],
      },
    ];

    const wrapper = createMockWrapper({ products: customProducts });
    const { result } = renderHook(
      () => useProducts({ limit: 100 }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].handle).toBe('custom-product');
  });

  // T060: default mock data: Russian names, RUB prices, placeholder URLs
  it('T060: default mock data has Russian names, RUB prices, and placeholder URLs', () => {
    // Check products have Russian titles
    for (const product of mockProducts) {
      // All prices should be positive (in kopecks for RUB)
      expect(product.price).toBeGreaterThan(0);

      // All images should have placeholder URLs
      for (const img of product.images) {
        expect(img.url).toContain('placehold.co');
      }
    }

    // At least most products should have Russian titles (Cyrillic chars)
    const cyrillicPattern = /[\u0400-\u04FF]/;
    const russianTitles = mockProducts.filter((p) => cyrillicPattern.test(p.title));
    expect(russianTitles.length).toBeGreaterThan(40);
  });

  // T061: Ensure 50+ products and 5 collections in mock data
  it('T061: mock data contains 50+ products and exactly 5 collections', () => {
    expect(mockProducts.length).toBeGreaterThanOrEqual(50);
    expect(mockCollections).toHaveLength(5);

    // Each collection should have required fields
    for (const col of mockCollections) {
      expect(col.id).toBeTruthy();
      expect(col.handle).toBeTruthy();
      expect(col.title).toBeTruthy();
      expect(col.description).toBeTruthy();
    }
  });
});
