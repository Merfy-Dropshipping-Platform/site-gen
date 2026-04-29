import { useStore } from '@nanostores/react';
import {
  $wishlist, $wishlistCount, $wishlistIds, $wishlistSyncStatus,
  addToWishlist, removeFromWishlist, toggleWishlist, clearWishlist,
} from './store';
import { queueAdd, queueRemove } from './sync';

export function useWishlist() {
  const items      = useStore($wishlist);
  const count      = useStore($wishlistCount);
  const ids        = useStore($wishlistIds);
  const syncStatus = useStore($wishlistSyncStatus);

  return {
    items,
    count,
    syncStatus,
    isInWishlist: (productId: string) => ids.has(productId),
    add: (productId: string) => {
      const before = ids.has(productId);
      addToWishlist(productId);
      if (!before && $wishlistIds.get().has(productId)) queueAdd(productId);
    },
    remove: (productId: string) => {
      removeFromWishlist(productId);
      queueRemove(productId);
    },
    toggle: (productId: string) => {
      const willAdd = !ids.has(productId);
      toggleWishlist(productId);
      if (willAdd && $wishlistIds.get().has(productId)) queueAdd(productId);
      else if (!willAdd) queueRemove(productId);
    },
    clear: () => clearWishlist(),
  };
}
