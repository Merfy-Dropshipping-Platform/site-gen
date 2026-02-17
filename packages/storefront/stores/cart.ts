import { atom, computed } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';
import type { CartItem } from '../types';

/**
 * Persistent cart items stored in localStorage under key 'merfy-cart'.
 * Survives page reloads. Shared across all React Islands via Nano Stores.
 */
export const $cartItems = persistentAtom<CartItem[]>('merfy-cart', [], {
  encode: JSON.stringify,
  decode: JSON.parse,
});

/**
 * Computed: total number of items in cart (sum of quantities).
 */
export const $cartCount = computed($cartItems, (items) =>
  items.reduce((sum, item) => sum + item.quantity, 0),
);

/**
 * Computed: total price of all items in cart (price * quantity, in kopecks).
 */
export const $cartTotal = computed($cartItems, (items) =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0),
);

/**
 * Add an item to the cart. If item with same variantId exists, increment quantity.
 */
export function addToCart(item: Omit<CartItem, 'quantity'>): void {
  const current = $cartItems.get();
  const existing = current.find((i) => i.variantId === item.variantId);
  if (existing) {
    $cartItems.set(
      current.map((i) =>
        i.variantId === item.variantId
          ? { ...i, quantity: i.quantity + 1 }
          : i,
      ),
    );
  } else {
    $cartItems.set([...current, { ...item, quantity: 1 }]);
  }
}

/**
 * Remove an item from the cart by variantId.
 */
export function removeFromCart(variantId: string): void {
  $cartItems.set($cartItems.get().filter((i) => i.variantId !== variantId));
}

/**
 * Update quantity for a specific item. Removes item if quantity <= 0.
 */
export function updateQuantity(variantId: string, quantity: number): void {
  if (quantity <= 0) {
    removeFromCart(variantId);
    return;
  }
  $cartItems.set(
    $cartItems.get().map((i) =>
      i.variantId === variantId ? { ...i, quantity } : i,
    ),
  );
}

/**
 * Clear all items from the cart.
 */
export function clearCart(): void {
  $cartItems.set([]);
}
