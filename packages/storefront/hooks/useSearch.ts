import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStoreConfig } from '../provider';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import type { Product, PaginatedResponse } from '../types';
import { storeFetch } from '../lib/fetcher';

export interface UseSearchOptions {
  /** Debounce delay in ms (default 300) */
  debounce?: number;
  /** Max results to return (default 6) */
  limit?: number;
  /** Minimum query length before search fires (default 2) */
  minLength?: number;
}

export interface UseSearchResult {
  query: string;
  setQuery: (query: string) => void;
  results: Product[];
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  isLoading: boolean;
  hasResults: boolean;
}

/**
 * Debounced search hook.
 * Does not fire API request until query length >= minLength.
 * Debounces by 300ms (configurable).
 * Query key includes storeId for multi-tenant isolation.
 */
export const useSearch = (options: UseSearchOptions = {}): UseSearchResult => {
  const { apiBase, storeId } = useStoreConfig();
  const { debounce = 300, limit = 6, minLength = 2 } = options;

  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(query, debounce);

  const { data, isLoading } = useQuery<PaginatedResponse<Product>>({
    queryKey: ['search', storeId, debouncedQuery],
    queryFn: async () => {
      return storeFetch<PaginatedResponse<Product>>(
        apiBase,
        storeId,
        `/products/search?q=${encodeURIComponent(debouncedQuery)}&store_id=${storeId}&limit=${limit}`,
      );
    },
    enabled: debouncedQuery.length >= minLength,
  });

  return {
    query,
    setQuery,
    results: data?.data ?? [],
    isOpen,
    setIsOpen,
    isLoading: debouncedQuery.length >= minLength ? isLoading : false,
    hasResults: (data?.data?.length ?? 0) > 0,
  };
};
