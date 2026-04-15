import { useState, useCallback } from 'react';
import type { SortOption } from './useProducts';

export interface CatalogFilters {
  sort: SortOption;
  page: number;
  collectionId?: string;
  priceMin?: number;
  priceMax?: number;
  availability?: 'all' | 'in_stock' | 'sold_out';
  variantFilters?: Record<string, string>;
}

const DEFAULT_FILTERS: CatalogFilters = { sort: 'newest', page: 1 };

function readFiltersFromUrl(): CatalogFilters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;

  const params = new URLSearchParams(window.location.search);
  const sort = params.get('sort') as SortOption | null;
  const collection = params.get('collection');
  const priceMin = params.get('price_min');
  const priceMax = params.get('price_max');
  const page = params.get('page');
  const availability = params.get('availability') as CatalogFilters['availability'] | null;

  // Read variant filters (any param not in the known set)
  const knownParams = new Set(['sort', 'collection', 'price_min', 'price_max', 'page', 'availability']);
  const variantFilters: Record<string, string> = {};
  params.forEach((value, key) => {
    if (!knownParams.has(key)) {
      variantFilters[key] = value;
    }
  });

  return {
    sort: sort && ['price_asc', 'price_desc', 'newest', 'popular'].includes(sort)
      ? sort
      : 'newest',
    page: page ? Math.max(1, parseInt(page, 10)) : 1,
    collectionId: collection || undefined,
    priceMin: priceMin ? Number(priceMin) : undefined,
    priceMax: priceMax ? Number(priceMax) : undefined,
    availability: availability && ['all', 'in_stock', 'sold_out'].includes(availability)
      ? availability
      : undefined,
    variantFilters: Object.keys(variantFilters).length > 0 ? variantFilters : undefined,
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
  if (filters.page > 1) {
    params.set('page', String(filters.page));
  }
  if (filters.availability && filters.availability !== 'all') {
    params.set('availability', filters.availability);
  }
  if (filters.variantFilters) {
    for (const [key, value] of Object.entries(filters.variantFilters)) {
      params.set(key, value);
    }
  }

  const qs = params.toString();
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState(null, '', url);
}

export function useUrlFilters() {
  const [filters, setFiltersState] = useState<CatalogFilters>(readFiltersFromUrl);

  const setFilters = useCallback((update: Partial<CatalogFilters>) => {
    setFiltersState((prev) => {
      // FR-009: If any filter OTHER than page changes, reset page to 1
      const isOnlyPageChange = Object.keys(update).length === 1 && 'page' in update;
      const next = { ...prev, ...update };
      if (!isOnlyPageChange) {
        next.page = 1;
      }
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
