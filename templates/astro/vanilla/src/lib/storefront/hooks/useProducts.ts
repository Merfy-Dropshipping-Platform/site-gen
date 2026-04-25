import { useQuery } from '@tanstack/react-query';
import { useStoreConfig } from '../provider';
import type { Product } from '../types';
import { storeFetch } from '../lib/fetcher';
import type { CatalogFilters } from './useUrlFilters';

export type SortOption = 'price_asc' | 'price_desc' | 'newest' | 'popular';

export const PAGE_SIZE = 8;

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ProductsApiResponse {
  products: Product[];
  total: number;
  pagination?: PaginationInfo;
}

interface ProductsResult {
  products: Product[];
  total: number;
  pagination: PaginationInfo;
}

export interface UseProductsOptions {
  staleTime?: number;
  gcTime?: number;
  /** Build-time data for first paint. */
  initialData?: ProductsResult;
}

export function useProducts(filters: CatalogFilters, options: UseProductsOptions = {}) {
  const { apiBase, storeId } = useStoreConfig();

  const queryKey = ['products', storeId, filters];

  const { data, isLoading, isFetching, isError, error, isPlaceholderData } = useQuery<ProductsResult>({
    queryKey,
    placeholderData: (prev) => prev,
    initialData: options.initialData,
    initialDataUpdatedAt: options.initialData ? 0 : undefined,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('store_id', storeId);
      params.set('page', String(filters.page));
      params.set('limit', String(PAGE_SIZE));

      if (filters.sort) params.set('sort', filters.sort);
      if (filters.collectionId) params.set('collection_id', filters.collectionId);
      if (filters.priceMin !== undefined) params.set('min_price', String(filters.priceMin));
      if (filters.priceMax !== undefined) params.set('max_price', String(filters.priceMax));
      if (filters.availability && filters.availability !== 'all') params.set('availability', filters.availability);
      if (filters.variantFilters) {
        for (const [key, value] of Object.entries(filters.variantFilters)) {
          params.set(key, value);
        }
      }

      const response = await storeFetch<ProductsApiResponse>(
        apiBase,
        storeId,
        `/store/products?${params.toString()}`,
      );

      // Map backend fields to Product type (basePrice in rubles -> price in kopecks)
      const toKopecks = (v: any) => Math.round(parseFloat(v || '0') * 100);
      const mapped = response.products.map((p: any) => ({
        ...p,
        price: p.price != null ? toKopecks(p.price) : toKopecks(p.basePrice),
        compareAtPrice: p.compareAtPrice ? toKopecks(p.compareAtPrice) : undefined,
        handle: p.handle ?? p.id,
        images: (p.images ?? []).map((img: any) =>
          typeof img === 'string' ? { url: img } : img,
        ),
        variants: p.variants ?? p.variantCombinations ?? [],
      }));

      const pagination: PaginationInfo = response.pagination ?? {
        page: filters.page,
        limit: PAGE_SIZE,
        total: response.total,
        totalPages: Math.ceil(response.total / PAGE_SIZE),
      };

      return { products: mapped, total: response.total, pagination };
    },
    staleTime: options.staleTime ?? 5 * 60 * 1000,
    gcTime: options.gcTime ?? 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    products: data?.products ?? [],
    total: data?.total ?? 0,
    isFetching,
    pagination: data?.pagination ?? { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 },
    isLoading,
    isError,
    error: error as Error | null,
  };
}
