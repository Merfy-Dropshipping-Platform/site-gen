import { useQuery } from '@tanstack/react-query';
import { useStoreConfig } from '../provider';
import type { Product } from '../types';
import { storeFetch } from '../lib/fetcher';

/**
 * Fetches a single product by its handle (slug).
 * Query key includes storeId for multi-tenant isolation.
 */
export const useProduct = (handle: string) => {
  const { apiBase, storeId } = useStoreConfig();

  return useQuery<Product>({
    queryKey: ['product', storeId, handle],
    queryFn: async () => {
      return storeFetch<Product>(
        apiBase,
        storeId,
        `/products/${handle}?store_id=${storeId}`,
      );
    },
    enabled: !!handle,
  });
};
