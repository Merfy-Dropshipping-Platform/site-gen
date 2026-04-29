import { atom, computed } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';
import type { WishlistItem, WishlistSyncStatus } from './contract';
import { WISHLIST_LIMIT } from './contract';

export const $wishlist = persistentAtom<WishlistItem[]>('merfy-wishlist', [], {
  encode: JSON.stringify,
  decode: JSON.parse,
});

export const $wishlistCount = computed($wishlist, (i) => i.length);
export const $wishlistIds   = computed($wishlist, (i) => new Set(i.map((x) => x.productId)));

export const $wishlistSyncStatus = atom<WishlistSyncStatus>('idle');

export function addToWishlist(productId: string): void {
  const cur = $wishlist.get();
  if (cur.some((i) => i.productId === productId)) return;
  if (cur.length >= WISHLIST_LIMIT) return;
  $wishlist.set([...cur, { productId, addedAt: Date.now() }]);
}

export function removeFromWishlist(productId: string): void {
  $wishlist.set($wishlist.get().filter((i) => i.productId !== productId));
}

export function toggleWishlist(productId: string): void {
  const cur = $wishlist.get();
  if (cur.some((i) => i.productId === productId)) removeFromWishlist(productId);
  else addToWishlist(productId);
}

export function clearWishlist(): void {
  $wishlist.set([]);
}

/** Union by productId; on conflict keep the min(addedAt). Trimmed to WISHLIST_LIMIT. */
export function mergeIntoWishlist(incoming: WishlistItem[]): void {
  const map = new Map<string, WishlistItem>();
  for (const item of $wishlist.get()) map.set(item.productId, item);
  for (const item of incoming) {
    const existing = map.get(item.productId);
    if (!existing || item.addedAt < existing.addedAt) map.set(item.productId, item);
  }
  const merged = Array.from(map.values())
    .sort((a, b) => a.addedAt - b.addedAt)
    .slice(0, WISHLIST_LIMIT);
  $wishlist.set(merged);
}
