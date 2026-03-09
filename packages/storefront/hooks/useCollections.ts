import { useQuery } from '@tanstack/react-query';
import { useStoreConfig } from '../provider';
import { storeFetch } from '../lib/fetcher';
import type { Collection } from '../types';

interface CollectionsResponse {
  collections: Collection[];
  total: number;
}

export function useCollections() {
  const { apiBase, storeId } = useStoreConfig();

  const { data, isLoading, isError, error } = useQuery<CollectionsResponse>({
    queryKey: ['collections', storeId],
    queryFn: () =>
      storeFetch<CollectionsResponse>(
        apiBase,
        storeId,
        `/store/collections?store_id=${storeId}`,
      ),
    staleTime: 10 * 60 * 1000, // 10 min — collections rarely change
  });

  return {
    collections: data?.collections ?? [],
    total: data?.total ?? 0,
    isLoading,
    isError,
    error: error as Error | null,
  };
}
