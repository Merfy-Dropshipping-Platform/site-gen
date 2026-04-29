import { useMemo } from 'react';

export interface ThemeWishlistOptions {
  heartPosition?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  heartStyle?: 'outlined' | 'filled';
  [key: string]: unknown;
}

declare global {
  interface Window {
    __MERFY_THEME__?: { features?: { wishlist?: { options?: ThemeWishlistOptions } } };
  }
}

/**
 * Reads per-theme wishlist options injected by the build pipeline into
 * `window.__MERFY_THEME__`. The global is wired in Task 7.5 (PR 7) — until
 * then this hook returns {} and all consumers fall back to their defaults.
 *
 * SSR-safe: returns {} when window is not available.
 */
export function useThemeWishlistOptions(): ThemeWishlistOptions {
  return useMemo<ThemeWishlistOptions>(() => {
    if (typeof window === 'undefined') return {};
    return window.__MERFY_THEME__?.features?.wishlist?.options ?? {};
  }, []);
}
