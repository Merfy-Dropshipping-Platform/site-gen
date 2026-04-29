import type { WishlistItem } from './contract';

const BASE = '/api/storefront/wishlist';

async function call<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`wishlist api ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

interface ApiOk<T> { success: true; data: T }

export const wishlistApi = {
  list: () =>
    call<ApiOk<WishlistItem[]>>(BASE).then((r) => r.data),

  replace: (items: WishlistItem[]) =>
    call<ApiOk<WishlistItem[]>>(BASE, {
      method: 'PUT',
      body: JSON.stringify({ items }),
    }).then((r) => r.data),

  add: (productId: string) =>
    call<ApiOk<WishlistItem>>(`${BASE}/items`, {
      method: 'POST',
      body: JSON.stringify({ productId }),
    }).then((r) => r.data),

  remove: (productId: string) =>
    call<{ success: true }>(`${BASE}/items`, {
      method: 'DELETE',
      body: JSON.stringify({ productId }),
    }),
};
