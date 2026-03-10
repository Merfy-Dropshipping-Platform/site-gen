import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { StoreProvider } from '../../provider';
import type { StoreConfig, PaginatedResponse, Product } from '../../types';

const testConfig: StoreConfig = {
  apiBase: 'https://api.test.com',
  storeId: 'store-products-1',
  currency: 'RUB',
  locale: 'ru-RU',
};

const mockProduct: Product = {
  id: 'prod_1',
  handle: 'cotton-tee',
  title: 'Test Product',
  price: 2990,
  images: [],
  variants: [],
};

const mockResponse: PaginatedResponse<Product> = {
  data: [mockProduct],
  total: 1,
  page: 1,
  limit: 24,
  hasMore: false,
};

function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider config={testConfig}>
      {children}
    </StoreProvider>
  );
}

describe('useProducts', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // T015: useProducts basic call returns expected shape
  it('T015: returns {data, total, isLoading, isError, filters, setFilter, clearFilters, page, setPage, hasNextPage}', async () => {
    const { useProducts } = await import('../../hooks/useProducts');

    const { result } = renderHook(() => useProducts(), { wrapper: TestWrapper });

    // Initially loading
    expect(result.current).toHaveProperty('data');
    expect(result.current).toHaveProperty('total');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('isError');
    expect(result.current).toHaveProperty('filters');
    expect(result.current).toHaveProperty('setFilter');
    expect(result.current).toHaveProperty('clearFilters');
    expect(result.current).toHaveProperty('page');
    expect(result.current).toHaveProperty('setPage');
    expect(result.current).toHaveProperty('hasNextPage');

    // Check types
    expect(typeof result.current.setFilter).toBe('function');
    expect(typeof result.current.clearFilters).toBe('function');
    expect(typeof result.current.setPage).toBe('function');
    expect(typeof result.current.page).toBe('number');

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual([mockProduct]);
    expect(result.current.total).toBe(1);
    expect(result.current.isError).toBe(false);
    expect(result.current.hasNextPage).toBe(false);
  });

  // T016: useProducts with collectionId sends collection_id query param
  it('T016: with collectionId passes collection_id=summer in query params', async () => {
    const { useProducts } = await import('../../hooks/useProducts');

    renderHook(() => useProducts({ collectionId: 'summer' }), { wrapper: TestWrapper });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const url = fetchCall[0] as string;
    expect(url).toContain('collection_id=summer');
  });

  // T017: useProducts with sort sends sort query param
  it('T017: with sort passes sort=price_asc in query params', async () => {
    const { useProducts } = await import('../../hooks/useProducts');

    renderHook(() => useProducts({ sort: 'price_asc' }), { wrapper: TestWrapper });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const url = fetchCall[0] as string;
    expect(url).toContain('sort=price_asc');
  });

  // T018: setFilter resets pagination to page=1
  it('T018: setFilter resets pagination to page=1', async () => {
    const { useProducts } = await import('../../hooks/useProducts');

    const { result } = renderHook(() => useProducts(), { wrapper: TestWrapper });

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Navigate to page 2
    act(() => {
      result.current.setPage(2);
    });

    expect(result.current.page).toBe(2);

    // Set a filter - should reset to page 1
    act(() => {
      result.current.setFilter('color', 'red');
    });

    expect(result.current.page).toBe(1);
    expect(result.current.filters).toEqual({ color: 'red' });
  });
});
