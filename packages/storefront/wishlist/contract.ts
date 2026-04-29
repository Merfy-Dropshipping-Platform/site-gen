import type { ReactNode } from 'react';

export interface WishlistItem {
  productId: string;
  addedAt: number;
}

export interface HeartButtonProps {
  productId: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export interface WishlistViewProps {
  emptyState?: ReactNode;
}

export type WishlistSyncStatus = 'idle' | 'syncing' | 'error';

export const WISHLIST_LIMIT = 200;
