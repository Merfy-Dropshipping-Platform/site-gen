import React, { useEffect, useRef, useCallback } from 'react';
import { StoreProvider } from '../../lib/storefront/provider';
import { useProducts } from '../../lib/storefront/hooks/useProducts';
import { useUrlFilters, type CatalogFilters } from '../../lib/storefront/hooks/useUrlFilters';
import { useCollections } from '../../lib/storefront/hooks/useCollections';
import type { Product } from '../../lib/storefront/types';
import { ProductCard } from './ProductCard';

// --- Sub-components ---

interface ProductGridInnerProps {
  products: Product[];
  total: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  columns?: number;
}

function ProductGridInner({
  products,
  total,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  columns = 4,
}: ProductGridInnerProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="flex-1">
      {/* Product count */}
      <p className="text-sm text-[var(--color-text-muted)] mb-4">
        Найдено {total} товаров
      </p>

      {/* Grid */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 md:gap-6"
        style={{ '--grid-cols': columns } as React.CSSProperties}
      >
        <style>{`
          @media (min-width: 1024px) {
            [style*="--grid-cols"] {
              grid-template-columns: repeat(var(--grid-cols), 1fr) !important;
            }
          }
        `}</style>
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      {/* Loading spinner for next page */}
      {isFetchingNextPage && (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-2 border-[rgb(var(--color-primary-rgb))] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* All loaded message */}
      {!hasNextPage && products.length > 0 && (
        <p className="text-center text-sm text-[var(--color-text-muted)] py-8">
          Все товары загружены
        </p>
      )}

      {/* Sentinel for IntersectionObserver */}
      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}

// --- Skeleton ---

function SkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="flex-1">
      <div className="bg-gray-200 rounded h-4 w-32 mb-4 animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 md:gap-6">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="bg-gray-200 rounded-lg aspect-square mb-4" />
            <div className="bg-gray-200 rounded h-4 w-3/4 mb-2" />
            <div className="bg-gray-200 rounded h-5 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Sort Select ---

const SORT_OPTIONS = [
  { value: 'newest', label: 'Новинки' },
  { value: 'price_asc', label: 'Сначала дешёвые' },
  { value: 'price_desc', label: 'Сначала дорогие' },
  { value: 'popular', label: 'Популярные' },
] as const;

interface SortSelectProps {
  value: string;
  onChange: (sort: string) => void;
}

function SortSelect({ value, onChange }: SortSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-base)] bg-[var(--color-background)] text-sm text-[var(--color-text)] font-[family-name:var(--font-body)] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-primary-rgb))]"
    >
      {SORT_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// --- Main CatalogIsland ---

interface CatalogInnerProps {
  collectionSlug?: string;
  showCollectionFilter?: boolean;
  columns?: number;
}

function CatalogInner({ collectionSlug, showCollectionFilter = true, columns = 4 }: CatalogInnerProps) {
  const { filters, setFilters, resetFilters } = useUrlFilters();
  const { collections } = useCollections();

  // Resolve collectionSlug → collectionId
  useEffect(() => {
    if (collectionSlug && collections.length > 0 && !filters.collectionId) {
      const found = collections.find((c) => c.handle === collectionSlug);
      if (found) {
        setFilters({ collectionId: found.id });
      }
    }
  }, [collectionSlug, collections, filters.collectionId, setFilters]);

  const { products, total, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useProducts(filters);

  const hasActiveFilters = !!(filters.collectionId || filters.priceMin !== undefined || filters.priceMax !== undefined || filters.sort !== 'newest');

  // Loading state
  if (isLoading) {
    return <SkeletonGrid />;
  }

  // Error state
  if (isError) {
    return (
      <div className="flex-1 py-12 text-center">
        <p className="text-[var(--color-text-muted)] text-lg mb-4">
          Произошла ошибка при загрузке товаров
        </p>
        {error?.message && (
          <p className="text-[var(--color-text-muted)] text-sm mb-4">{error.message}</p>
        )}
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 border border-[var(--color-border)] rounded-[var(--radius-base)] text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-text)] transition-colors"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  // Empty states
  if (products.length === 0) {
    if (hasActiveFilters) {
      // FR-015: Filters active but 0 results
      return (
        <div className="flex-1 py-12 text-center">
          <p className="text-[var(--color-text-muted)] text-lg mb-4">
            Нет товаров по выбранным фильтрам
          </p>
          <button
            onClick={resetFilters}
            className="px-6 py-3 bg-[rgb(var(--color-primary-rgb))] text-[var(--color-button-text)] rounded-[var(--radius-base)] text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Сбросить все фильтры
          </button>
        </div>
      );
    }
    // FR-006: No products at all
    return (
      <div className="flex-1 py-12 text-center">
        <p className="text-[var(--color-text-muted)] text-lg">
          Товары скоро появятся
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Toolbar: sort + count */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-[var(--color-text-muted)]">
          Найдено {total} товаров
        </p>
        <SortSelect
          value={filters.sort}
          onChange={(sort) => setFilters({ sort: sort as CatalogFilters['sort'] })}
        />
      </div>

      {/* Content area */}
      <div className="flex gap-8">
        {/* Filters sidebar - shown on desktop when showCollectionFilter is true */}
        {showCollectionFilter && collections.length > 0 && (
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <div className="sticky top-24">
              <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 font-[family-name:var(--font-heading)]">
                Коллекции
              </h3>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="radio"
                    name="collection"
                    checked={!filters.collectionId}
                    onChange={() => setFilters({ collectionId: undefined })}
                    className="h-4 w-4 accent-[rgb(var(--color-primary-rgb))]"
                  />
                  <span className={`text-sm transition-colors ${!filters.collectionId ? 'text-[var(--color-text)] font-medium' : 'text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]'}`}>
                    Все товары
                  </span>
                </label>
                {collections.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="radio"
                      name="collection"
                      checked={filters.collectionId === c.id}
                      onChange={() => setFilters({ collectionId: c.id })}
                      className="h-4 w-4 accent-[rgb(var(--color-primary-rgb))]"
                    />
                    <span className={`text-sm transition-colors ${filters.collectionId === c.id ? 'text-[var(--color-text)] font-medium' : 'text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]'}`}>
                      {c.title}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </aside>
        )}

        {/* Product grid */}
        <ProductGridInner
          products={products}
          total={total}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
          columns={columns}
        />
      </div>
    </>
  );
}

// --- Exported CatalogIsland (wraps with providers) ---

export interface CatalogIslandProps {
  collectionSlug?: string;
  showCollectionFilter?: boolean;
  columns?: number;
}

export default function CatalogIsland(props: CatalogIslandProps) {
  // Read config from window.__MERFY_CONFIG__ injected by BaseLayout.astro
  const config = typeof window !== 'undefined' && (window as any).__MERFY_CONFIG__
    ? {
        apiBase: (window as any).__MERFY_CONFIG__.apiUrl || 'https://gateway.merfy.ru/api',
        storeId: (window as any).__MERFY_CONFIG__.shopId || '',
        currency: 'RUB',
        locale: 'ru-RU',
      }
    : { apiBase: '', storeId: '', currency: 'RUB', locale: 'ru-RU' };

  if (!config.storeId) {
    return (
      <div className="py-12 text-center">
        <p className="text-[var(--color-text-muted)]">Магазин не настроен</p>
      </div>
    );
  }

  return (
    <StoreProvider config={config}>
      <CatalogInner {...props} />
    </StoreProvider>
  );
}
