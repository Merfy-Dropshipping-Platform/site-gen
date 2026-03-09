import { useState, useCallback } from 'react';
import type { SortOption } from './useProducts';

export interface CatalogFilters {
  sort: SortOption;
  collectionId?: string;
  priceMin?: number;
  priceMax?: number;
}

const DEFAULT_FILTERS: CatalogFilters = { sort: 'newest' };

function readFiltersFromUrl(): CatalogFilters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;

  const params = new URLSearchParams(window.location.search);
  const sort = params.get('sort') as SortOption | null;
  const collection = params.get('collection');
  const priceMin = params.get('price_min');
  const priceMax = params.get('price_max');

  return {
    sort: sort && ['price_asc', 'price_desc', 'newest', 'popular'].includes(sort)
      ? sort
      : 'newest',
    collectionId: collection || undefined,
    priceMin: priceMin ? Number(priceMin) : undefined,
    priceMax: priceMax ? Number(priceMax) : undefined,
  };
}

function writeFiltersToUrl(filters: CatalogFilters): void {
  if (typeof window === 'undefined') return;

  const params = new URLSearchParams();

  if (filters.sort && filters.sort !== 'newest') {
    params.set('sort', filters.sort);
  }
  if (filters.collectionId) {
    params.set('collection', filters.collectionId);
  }
  if (filters.priceMin !== undefined) {
    params.set('price_min', String(filters.priceMin));
  }
  if (filters.priceMax !== undefined) {
    params.set('price_max', String(filters.priceMax));
  }

  const qs = params.toString();
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState(null, '', url);
}

export function useUrlFilters() {
  const [filters, setFiltersState] = useState<CatalogFilters>(readFiltersFromUrl);

  const setFilters = useCallback((update: Partial<CatalogFilters>) => {
    setFiltersState((prev) => {
      const next = { ...prev, ...update };
      writeFiltersToUrl(next);
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
    writeFiltersToUrl(DEFAULT_FILTERS);
  }, []);

  return { filters, setFilters, resetFilters };
}
