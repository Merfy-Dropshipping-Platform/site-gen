import { describe, it, expect, beforeEach } from 'vitest';
import {
  $cartItems,
  $cartCount,
  $cartTotal,
  addToCart,
  removeFromCart,
  updateQuantity,
  clearCart,
} from '../../stores/cart';
import type { CartItem } from '../../types';

const makeItem = (overrides: Partial<CartItem> = {}): Omit<CartItem, 'quantity'> => ({
  variantId: 'var_1',
  title: 'Test Product',
  price: 2990,
  image: 'https://example.com/img.jpg',
  productId: 'prod_1',
  productHandle: 'test-product',
  variantTitle: 'M',
  ...overrides,
});

describe('Cart store (Nano Stores)', () => {
  beforeEach(() => {
    $cartItems.set([]);
  });

  // T023: addToCart new item: items has 1 element, quantity=1, count=1, total=2990
  it('T023: addToCart new item: items=1, quantity=1, count=1, total=2990', () => {
    addToCart(makeItem({ price: 2990 }));

    const items = $cartItems.get();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(1);
    expect(items[0].variantId).toBe('var_1');
    expect(items[0].price).toBe(2990);

    expect($cartCount.get()).toBe(1);
    expect($cartTotal.get()).toBe(2990);
  });

  // T024: addToCart duplicate variantId: quantity increases to 2, no duplicate, count=2
  it('T024: addToCart duplicate variantId: quantity=2, no duplicate, count=2', () => {
    addToCart(makeItem({ variantId: 'var_dup', price: 1000 }));
    addToCart(makeItem({ variantId: 'var_dup', price: 1000 }));

    const items = $cartItems.get();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
    expect(items[0].variantId).toBe('var_dup');

    expect($cartCount.get()).toBe(2);
    expect($cartTotal.get()).toBe(2000);
  });

  // T025: removeFromCart: item removed
  it('T025: removeFromCart removes the item', () => {
    addToCart(makeItem({ variantId: 'var_to_remove' }));
    expect($cartItems.get()).toHaveLength(1);

    removeFromCart('var_to_remove');
    expect($cartItems.get()).toHaveLength(0);
    expect($cartCount.get()).toBe(0);
  });

  // T026: updateQuantity(id, 0): item removed
  it('T026: updateQuantity(id, 0) removes the item', () => {
    addToCart(makeItem({ variantId: 'var_zero' }));
    expect($cartItems.get()).toHaveLength(1);

    updateQuantity('var_zero', 0);
    expect($cartItems.get()).toHaveLength(0);
    expect($cartCount.get()).toBe(0);
  });

  // T027: clearCart: empty, count=0, total=0
  it('T027: clearCart empties the cart, count=0, total=0', () => {
    addToCart(makeItem({ variantId: 'var_a', price: 1000 }));
    addToCart(makeItem({ variantId: 'var_b', price: 2000 }));
    expect($cartItems.get()).toHaveLength(2);

    clearCart();
    expect($cartItems.get()).toHaveLength(0);
    expect($cartCount.get()).toBe(0);
    expect($cartTotal.get()).toBe(0);
  });

  // T028: $cartCount and $cartTotal computed: correct calculations with multiple items
  it('T028: computed stores calculate correctly with multiple items', () => {
    addToCart(makeItem({ variantId: 'var_x', price: 1000 }));
    addToCart(makeItem({ variantId: 'var_y', price: 2500 }));
    // Add a second of var_x
    addToCart(makeItem({ variantId: 'var_x', price: 1000 }));

    // var_x: qty=2 * 1000 = 2000
    // var_y: qty=1 * 2500 = 2500
    expect($cartCount.get()).toBe(3); // 2 + 1
    expect($cartTotal.get()).toBe(4500); // 2000 + 2500
  });

  // T029: addItem with price=0: item added (free items allowed)
  it('T029: addToCart with price=0 allows free items', () => {
    addToCart(makeItem({ variantId: 'var_free', price: 0 }));

    const items = $cartItems.get();
    expect(items).toHaveLength(1);
    expect(items[0].price).toBe(0);
    expect($cartTotal.get()).toBe(0);
    expect($cartCount.get()).toBe(1);
  });

  // T030: updateQuantity with negative: item removed
  it('T030: updateQuantity with negative quantity removes the item', () => {
    addToCart(makeItem({ variantId: 'var_neg' }));
    expect($cartItems.get()).toHaveLength(1);

    updateQuantity('var_neg', -1);
    expect($cartItems.get()).toHaveLength(0);
    expect($cartCount.get()).toBe(0);
  });

  // T031: Sync between subscribers - two listeners get the same update
  it('T031: multiple subscribers receive update simultaneously', () => {
    const updates1: CartItem[][] = [];
    const updates2: CartItem[][] = [];

    const unsub1 = $cartItems.subscribe((items) => {
      updates1.push([...items]);
    });
    const unsub2 = $cartItems.subscribe((items) => {
      updates2.push([...items]);
    });

    addToCart(makeItem({ variantId: 'var_sync', price: 500 }));

    // Both subscribers should have received the same update
    // First call is the initial value (empty), second is after addToCart
    expect(updates1.length).toBeGreaterThanOrEqual(2);
    expect(updates2.length).toBeGreaterThanOrEqual(2);

    // The last update for both should be the same
    const last1 = updates1[updates1.length - 1];
    const last2 = updates2[updates2.length - 1];
    expect(last1).toEqual(last2);
    expect(last1).toHaveLength(1);
    expect(last1[0].variantId).toBe('var_sync');

    unsub1();
    unsub2();
  });
});
