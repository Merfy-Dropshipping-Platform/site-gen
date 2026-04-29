import { describe, it, expect, beforeEach } from 'vitest';
import {
  $wishlist, $wishlistCount, $wishlistIds, $wishlistSyncStatus,
  addToWishlist, removeFromWishlist, toggleWishlist, clearWishlist, mergeIntoWishlist,
} from '../../wishlist/store';

describe('Wishlist store', () => {
  beforeEach(() => {
    $wishlist.set([]);
    $wishlistSyncStatus.set('idle');
  });

  it('addToWishlist new product: count=1, id present', () => {
    addToWishlist('prod_a');
    expect($wishlist.get()).toHaveLength(1);
    expect($wishlist.get()[0].productId).toBe('prod_a');
    expect($wishlistCount.get()).toBe(1);
    expect($wishlistIds.get().has('prod_a')).toBe(true);
  });

  it('addToWishlist duplicate: idempotent, still 1', () => {
    addToWishlist('prod_a');
    addToWishlist('prod_a');
    expect($wishlist.get()).toHaveLength(1);
  });

  it('removeFromWishlist removes the product', () => {
    addToWishlist('prod_a');
    removeFromWishlist('prod_a');
    expect($wishlist.get()).toHaveLength(0);
    expect($wishlistIds.get().has('prod_a')).toBe(false);
  });

  it('toggleWishlist adds when missing, removes when present', () => {
    toggleWishlist('prod_a');
    expect($wishlistIds.get().has('prod_a')).toBe(true);
    toggleWishlist('prod_a');
    expect($wishlistIds.get().has('prod_a')).toBe(false);
  });

  it('addToWishlist respects WISHLIST_LIMIT (200)', () => {
    for (let i = 0; i < 200; i++) addToWishlist(`prod_${i}`);
    expect($wishlist.get()).toHaveLength(200);
    addToWishlist('prod_overflow');
    expect($wishlist.get()).toHaveLength(200);
    expect($wishlistIds.get().has('prod_overflow')).toBe(false);
  });

  it('clearWishlist empties everything', () => {
    addToWishlist('prod_a');
    addToWishlist('prod_b');
    clearWishlist();
    expect($wishlist.get()).toHaveLength(0);
  });

  it('mergeIntoWishlist: union by productId, takes min(addedAt)', () => {
    const t1 = 1_000_000_000_000;
    const t2 = 2_000_000_000_000;
    $wishlist.set([{ productId: 'prod_a', addedAt: t2 }]);
    mergeIntoWishlist([
      { productId: 'prod_a', addedAt: t1 },
      { productId: 'prod_b', addedAt: t2 },
    ]);
    const items = $wishlist.get();
    expect(items).toHaveLength(2);
    const a = items.find((i) => i.productId === 'prod_a')!;
    expect(a.addedAt).toBe(t1);
  });

  it('multiple subscribers receive same updates', () => {
    const u1: number[] = [];
    const u2: number[] = [];
    const off1 = $wishlistCount.subscribe((v) => u1.push(v));
    const off2 = $wishlistCount.subscribe((v) => u2.push(v));
    addToWishlist('prod_x');
    expect(u1[u1.length - 1]).toBe(1);
    expect(u2[u2.length - 1]).toBe(1);
    off1(); off2();
  });
});
