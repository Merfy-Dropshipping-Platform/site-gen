import { useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { $cartItems, $cartCount, $cartTotal } from '../stores/cart';
import { useStoreConfig } from '../provider';
import type { CartItem } from '../types';

export interface UseCartResult {
  items: CartItem[];
  count: number;
  total: number;
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  clear: () => void;
  syncToServer: () => Promise<{ cartId: string }>;
}

/**
 * Cart hook wrapping Nano Stores cart.
 * Uses useStore() for reactive updates across all React Islands.
 *
 * addItem: increments quantity if item with same variantId already exists.
 * Cart is persisted in localStorage via persistentAtom.
 * syncToServer: creates a server-side cart (for checkout).
 */
export const useCart = (): UseCartResult => {
  const { apiBase, storeId } = useStoreConfig();
  const items = useStore($cartItems);
  const count = useStore($cartCount);
  const total = useStore($cartTotal);

  const addItem = useCallback((item: Omit<CartItem, 'quantity'>) => {
    const current = $cartItems.get();
    const existing = current.find((i) => i.variantId === item.variantId);
    $cartItems.set(
      existing
        ? current.map((i) =>
            i.variantId === item.variantId
              ? { ...i, quantity: i.quantity + 1 }
              : i,
          )
        : [...current, { ...item, quantity: 1 }],
    );
  }, []);

  const removeItem = useCallback((variantId: string) => {
    $cartItems.set($cartItems.get().filter((i) => i.variantId !== variantId));
  }, []);

  const updateQuantity = useCallback((variantId: string, quantity: number) => {
    if (quantity <= 0) {
      $cartItems.set($cartItems.get().filter((i) => i.variantId !== variantId));
      return;
    }
    $cartItems.set(
      $cartItems.get().map((i) =>
        i.variantId === variantId ? { ...i, quantity } : i,
      ),
    );
  }, []);

  const clear = useCallback(() => {
    $cartItems.set([]);
  }, []);

  const syncToServer = useCallback(async (): Promise<{ cartId: string }> => {
    const response = await fetch(`${apiBase}/carts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Store-Id': storeId },
      body: JSON.stringify({ storeId, items: $cartItems.get() }),
    });
    return response.json();
  }, [apiBase, storeId]);

  return { items, count, total, addItem, removeItem, updateQuantity, clear, syncToServer };
};
