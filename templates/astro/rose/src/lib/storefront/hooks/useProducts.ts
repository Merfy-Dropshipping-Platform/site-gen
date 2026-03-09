import { useInfiniteQuery } from '@tanstack/react-query';
import { useStoreConfig } from '../provider';
import type { Product } from '../types';
import { storeFetch } from '../lib/fetcher';
import type { CatalogFilters } from './useUrlFilters';

export type SortOption = 'price_asc' | 'price_desc' | 'newest' | 'popular';

const PAGE_SIZE = 20;

interface ProductsApiResponse {
  products: Product[];
  total: number;
}

interface InfiniteProductPage {
  products: Product[];
  total: number;
  hasMore: boolean;
  offset: number;
}

export interface UseProductsOptions {
  staleTime?: number;
  gcTime?: number;
}

export function useProducts(filters: CatalogFilters, options: UseProductsOptions = {}) {
  const { apiBase, storeId } = useStoreConfig();

  const queryKey = ['products', storeId, filters];

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<InfiniteProductPage>({
    queryKey,
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams();
      params.set('store_id', storeId);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(pageParam));

      if (filters.sort) params.set('sort', filters.sort);
      if (filters.collectionId) params.set('collection_id', filters.collectionId);
      if (filters.priceMin !== undefined) params.set('min_price', String(filters.priceMin));
      if (filters.priceMax !== undefined) params.set('max_price', String(filters.priceMax));

      const response = await storeFetch<ProductsApiResponse>(
        apiBase,
        storeId,
        `/store/products?${params.toString()}`,
      );

      // Map backend fields to Product type (basePrice in rubles → price in kopecks)
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

      const offset = pageParam as number;
      return {
        products: mapped,
        total: response.total,
        hasMore: response.total > offset + PAGE_SIZE,
        offset,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + PAGE_SIZE : undefined,
    staleTime: options.staleTime ?? 5 * 60 * 1000,
    gcTime: options.gcTime ?? 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const products = data?.pages.flatMap((page) => page.products) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  return {
    products,
    total,
    isLoading,
    isError,
    error: error as Error | null,
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
  };
}
