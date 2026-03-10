import { useQuery } from '@tanstack/react-query';
import { useStoreConfig } from '../provider';
import { storeFetch } from '../lib/fetcher';
import type { CatalogFilters } from './useUrlFilters';

export interface VariantGroup {
  name: string;
  values: string[];
}

export interface FiltersData {
  variantGroups: VariantGroup[];
  priceRange: { min: number; max: number };
  totalProducts: number;
}

interface FiltersApiResponse {
  success: boolean;
  data: {
    groups?: VariantGroup[];
    variantGroups?: VariantGroup[];
    priceRange?: { min: number; max: number };
    totalProducts?: number;
  };
}

export function useFilters(filters: CatalogFilters) {
  const { apiBase, storeId } = useStoreConfig();

  return useQuery<FiltersData>({
    queryKey: ['filters', storeId, {
      availability: filters.availability,
      priceMin: filters.priceMin,
      priceMax: filters.priceMax,
      variantFilters: filters.variantFilters,
    }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('store_id', storeId);
      if (filters.availability && filters.availability !== 'all') {
        params.set('availability', filters.availability);
      }
      if (filters.priceMin !== undefined) {
        params.set('min_price', String(filters.priceMin));
      }
      if (filters.priceMax !== undefined) {
        params.set('max_price', String(filters.priceMax));
      }
      if (filters.variantFilters) {
        for (const [key, value] of Object.entries(filters.variantFilters)) {
          params.set(key, value);
        }
      }
      const response = await storeFetch<FiltersApiResponse>(
        apiBase,
        storeId,
        `/store/filters?${params.toString()}`,
      );
      const raw = response.data ?? response;
      return {
        variantGroups: raw.groups ?? raw.variantGroups ?? [],
        priceRange: raw.priceRange ?? { min: 0, max: 0 },
        totalProducts: raw.totalProducts ?? 0,
      };
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
