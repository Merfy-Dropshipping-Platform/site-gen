import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStoreConfig } from '../provider';
import type { Product, PaginatedResponse } from '../types';
import { storeFetch } from '../lib/fetcher';

export type SortOption = 'price_asc' | 'price_desc' | 'newest' | 'popular';

export interface UseProductsOptions {
  collectionId?: string;
  sort?: SortOption;
  limit?: number;
  filters?: Record<string, unknown>;
}

export interface UseProductsResult {
  data: Product[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  filters: Record<string, unknown>;
  setFilter: (key: string, value: unknown) => void;
  clearFilters: () => void;
  page: number;
  setPage: (page: number) => void;
  hasNextPage: boolean;
}

/**
 * Fetches a paginated list of products with filtering, sorting, and pagination.
 * Filter changes automatically reset pagination to page 1.
 * Query key includes storeId for multi-tenant isolation.
 */
export const useProducts = (options: UseProductsOptions = {}): UseProductsResult => {
  const { apiBase, storeId } = useStoreConfig();
  const { collectionId, sort, limit = 24 } = options;

  const [filters, setFiltersState] = useState<Record<string, unknown>>(options.filters ?? {});
  const [page, setPageState] = useState(1);

  const queryKey = ['products', storeId, { collectionId, sort, limit, filters, page }];

  const { data, isLoading, isError, error } = useQuery<PaginatedResponse<Product>>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('store_id', storeId);
      if (collectionId) params.set('collection_id', collectionId);
      if (sort) params.set('sort', sort);
      params.set('limit', String(limit));
      params.set('offset', String((page - 1) * limit));

      // Serialize filters into query params
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && value !== '') {
          if (Array.isArray(value)) {
            value.forEach((v) => params.append(`${key}[]`, String(v)));
          } else {
            params.set(key, String(value));
          }
        }
      }

      return storeFetch<PaginatedResponse<Product>>(
        apiBase,
        storeId,
        `/products?${params.toString()}`,
      );
    },
  });

  const setFilter = useCallback((key: string, value: unknown) => {
    setFiltersState((prev) => ({ ...prev, [key]: value }));
    setPageState(1); // Reset pagination on filter change
  }, []);

  const clearFilters = useCallback(() => {
    setFiltersState({});
    setPageState(1);
  }, []);

  const setPage = useCallback((newPage: number) => {
    setPageState(newPage);
  }, []);

  return {
    data: data?.data ?? [],
    total: data?.total ?? 0,
    isLoading,
    isError,
    error: error as Error | null,
    filters,
    setFilter,
    clearFilters,
    page,
    setPage,
    hasNextPage: data?.hasMore ?? false,
  };
};
