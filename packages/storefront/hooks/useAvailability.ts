import { useQuery } from '@tanstack/react-query';
import { useStoreConfig } from '../provider';
import { storeFetch } from '../lib/fetcher';

export interface AvailabilityResult {
  available: boolean;
  quantity: number;
}

/**
 * Checks realtime availability for a specific variant.
 * Short staleTime (30s) and refetchInterval (60s) for near-realtime updates.
 * Query key includes storeId for multi-tenant isolation.
 */
export const useAvailability = (variantId: string) => {
  const { apiBase, storeId } = useStoreConfig();

  return useQuery<AvailabilityResult>({
    queryKey: ['availability', storeId, variantId],
    queryFn: async () => {
      return storeFetch<AvailabilityResult>(
        apiBase,
        storeId,
        `/products/${variantId}/availability?store_id=${storeId}`,
      );
    },
    enabled: !!variantId,
    staleTime: 30_000,       // 30 seconds
    refetchInterval: 60_000, // 60 seconds
  });
};
