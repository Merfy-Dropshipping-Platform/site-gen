import { createPartStore } from './store';
import type { FavoritesPart, FavoritesState } from './types';

// Избранное — шов (С7-5 — потом): отметки в памяти страницы.
export function createFavorites(): FavoritesPart {
  const store = createPartStore<FavoritesState>({ productIds: [] });
  const has = (productId: string): boolean => store.get().productIds.includes(productId);
  const toggle = (productId: string): void => {
    const ids = store.get().productIds;
    store.set({ productIds: has(productId) ? ids.filter((id) => id !== productId) : [...ids, productId] });
  };
  return { get: store.get, subscribe: store.subscribe, toggle, has };
}

export const part = createFavorites();
