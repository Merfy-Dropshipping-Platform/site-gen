import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { StoreProvider } from '../../provider';
import { useProduct } from '../../hooks/useProduct';
import type { StoreConfig, Product } from '../../types';

const testConfig: StoreConfig = {
  apiBase: 'https://api.test.com',
  storeId: 'store-product-1',
  currency: 'RUB',
  locale: 'ru-RU',
};

const mockProduct: Product = {
  id: 'prod_1',
  handle: 'cotton-tee',
  title: 'Cotton Tee',
  price: 29900,
  images: [{ url: 'https://example.com/img.jpg', alt: 'Cotton Tee' }],
  variants: [
    { id: 'var_1', title: 'M', price: 29900, available: true },
  ],
  tags: ['summer'],
  vendor: 'TestVendor',
};

function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider config={testConfig}>
      {children}
    </StoreProvider>
  );
}

describe('useProduct', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockProduct),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // T019: useProduct("cotton-tee") returns Product, query key includes storeId
  it('T019: useProduct("cotton-tee") returns Product and query key includes storeId', async () => {
    const { result } = renderHook(() => useProduct('cotton-tee'), { wrapper: TestWrapper });

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockProduct);
    expect(result.current.data?.handle).toBe('cotton-tee');
    expect(result.current.data?.title).toBe('Cotton Tee');
    expect(result.current.data?.price).toBe(29900);
    expect(result.current.isError).toBe(false);

    // Verify the fetch URL includes the handle and storeId
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const url = fetchCall[0] as string;
    expect(url).toContain('cotton-tee');
    expect(url).toContain('store_id=store-product-1');

    // Verify X-Store-Id header was sent
    const fetchOptions = fetchCall[1] as RequestInit;
    const headers = fetchOptions.headers as Record<string, string>;
    expect(headers['X-Store-Id']).toBe('store-product-1');
  });
});
