import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StoreProvider } from '../../provider';
import { useSearch } from '../../hooks/useSearch';
import type { StoreConfig, PaginatedResponse, Product } from '../../types';

const testConfig: StoreConfig = {
  apiBase: 'https://api.test.com',
  storeId: 'store-search-1',
  currency: 'RUB',
  locale: 'ru-RU',
};

const mockProduct: Product = {
  id: 'prod_1',
  handle: 'cotton-tee',
  title: 'Хлопковая футболка',
  description: 'Мягкая футболка из 100% хлопка.',
  price: 299000,
  images: [{ url: 'https://placehold.co/600x800', alt: 'Футболка' }],
  variants: [{ id: 'var_1', title: 'M', price: 299000, available: true }],
  tags: ['футболки'],
};

function createSearchResponse(products: Product[]): PaginatedResponse<Product> {
  return {
    data: products,
    total: products.length,
    page: 1,
    limit: 6,
    hasMore: false,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <StoreProvider config={testConfig}>
          {children}
        </StoreProvider>
      </QueryClientProvider>
    );
  };
}

describe('useSearch (US3)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(createSearchResponse([mockProduct, mockProduct, mockProduct])),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  // T038: minLength: setQuery("x") with 1 char -> API NOT called
  it('T038: setQuery with single char (below minLength=2) does NOT call API', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useSearch(), { wrapper });

    act(() => {
      result.current.setQuery('\u0444'); // single Russian char "ф"
    });

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });

  // T039: debounce: request NOT sent before 300ms
  it('T039: API request is NOT sent before 300ms debounce period', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useSearch(), { wrapper });

    act(() => {
      result.current.setQuery('\u0444\u0443\u0442'); // "фут" - 3 chars, above minLength
    });

    // Advance only 200ms - should NOT have fired
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // T040: debounce: request sent after 300ms with q=фут
  it('T040: API request IS sent after 300ms with correct query param', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useSearch(), { wrapper });

    act(() => {
      result.current.setQuery('\u0444\u0443\u0442'); // "фут" - 3 chars
    });

    // Advance past 300ms debounce
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const url = fetchCall[0] as string;
    expect(url).toContain('q=');
    expect(url).toContain(encodeURIComponent('\u0444\u0443\u0442'));
  });

  // T041: hasResults: true with 3 results, false with 0
  it('T041: hasResults is true when results exist and false when empty', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useSearch(), { wrapper });

    // Initially, no results
    expect(result.current.hasResults).toBe(false);

    act(() => {
      result.current.setQuery('\u0444\u0443\u0442\u0431\u043e\u043b'); // "футбол" - valid query
    });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(result.current.hasResults).toBe(true);
    });

    expect(result.current.results).toHaveLength(3);
  });

  // T042: isOpen/setIsOpen: visibility management
  it('T042: isOpen defaults to false; setIsOpen toggles visibility', () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useSearch(), { wrapper });

    expect(result.current.isOpen).toBe(false);

    act(() => {
      result.current.setIsOpen(true);
    });

    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.setIsOpen(false);
    });

    expect(result.current.isOpen).toBe(false);
  });

  // T043: custom debounce 500ms: request sent after 500ms, not before
  it('T043: custom debounce of 500ms: request NOT sent at 400ms, sent after 500ms', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useSearch({ debounce: 500 }), { wrapper });

    act(() => {
      result.current.setQuery('\u0444\u0443\u0442\u0431\u043e\u043b\u043a\u0430'); // "футболка"
    });

    // 400ms - should NOT have fired with 500ms debounce
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();

    // Advance to 550ms total
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
  });
});
