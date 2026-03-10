import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { StoreProvider } from '../../provider';
import { useCart } from '../../hooks/useCart';
import { $cartItems } from '../../stores/cart';
import type { StoreConfig } from '../../types';

const testConfig: StoreConfig = {
  apiBase: 'https://api.test.com',
  storeId: 'store-cart-1',
  currency: 'RUB',
  locale: 'ru-RU',
};

function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider config={testConfig}>
      {children}
    </StoreProvider>
  );
}

describe('useCart hook', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    $cartItems.set([]);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ cartId: 'server-cart-1', success: true }),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // T032: useCart hook: addItem, removeItem, updateQuantity, clear
  it('T032: useCart exposes addItem, removeItem, updateQuantity, clear that modify cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper: TestWrapper });

    // Initially empty
    expect(result.current.items).toEqual([]);
    expect(result.current.count).toBe(0);
    expect(result.current.total).toBe(0);

    // addItem
    act(() => {
      result.current.addItem({
        variantId: 'var_cart_1',
        title: 'Cart Item 1',
        price: 1500,
        image: 'https://example.com/img.jpg',
      });
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].variantId).toBe('var_cart_1');
    expect(result.current.items[0].quantity).toBe(1);
    expect(result.current.count).toBe(1);
    expect(result.current.total).toBe(1500);

    // addItem again (duplicate) should increase quantity
    act(() => {
      result.current.addItem({
        variantId: 'var_cart_1',
        title: 'Cart Item 1',
        price: 1500,
        image: 'https://example.com/img.jpg',
      });
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(2);
    expect(result.current.count).toBe(2);
    expect(result.current.total).toBe(3000);

    // updateQuantity
    act(() => {
      result.current.updateQuantity('var_cart_1', 5);
    });

    expect(result.current.items[0].quantity).toBe(5);
    expect(result.current.count).toBe(5);
    expect(result.current.total).toBe(7500);

    // Add a second item
    act(() => {
      result.current.addItem({
        variantId: 'var_cart_2',
        title: 'Cart Item 2',
        price: 2000,
        image: 'https://example.com/img2.jpg',
      });
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.count).toBe(6); // 5 + 1
    expect(result.current.total).toBe(9500); // 7500 + 2000

    // removeItem
    act(() => {
      result.current.removeItem('var_cart_1');
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].variantId).toBe('var_cart_2');
    expect(result.current.count).toBe(1);
    expect(result.current.total).toBe(2000);

    // clear
    act(() => {
      result.current.clear();
    });

    expect(result.current.items).toHaveLength(0);
    expect(result.current.count).toBe(0);
    expect(result.current.total).toBe(0);
  });

  // T033: useCart syncToServer: POST to {apiBase}/carts with storeId and items
  it('T033: syncToServer POSTs to {apiBase}/carts with storeId and items', async () => {
    const { result } = renderHook(() => useCart(), { wrapper: TestWrapper });

    // Add an item first
    act(() => {
      result.current.addItem({
        variantId: 'var_sync_1',
        title: 'Sync Item',
        price: 3000,
        image: 'https://example.com/img.jpg',
      });
    });

    // Call syncToServer
    let syncResult: { cartId: string } | undefined;
    await act(async () => {
      syncResult = await result.current.syncToServer();
    });

    expect(syncResult).toEqual({ cartId: 'server-cart-1', success: true });

    // Verify fetch was called with correct params
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.test.com/carts',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Store-Id': 'store-cart-1',
        }),
      }),
    );

    // Verify body contains storeId and items
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body as string);
    expect(body.storeId).toBe('store-cart-1');
    expect(body.items).toHaveLength(1);
    expect(body.items[0].variantId).toBe('var_sync_1');
  });
});
