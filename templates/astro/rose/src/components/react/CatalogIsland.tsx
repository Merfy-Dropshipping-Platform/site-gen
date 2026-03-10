import React, { useEffect } from 'react';
import { StoreProvider } from '../../lib/storefront/provider';
import { useProducts, PAGE_SIZE } from '../../lib/storefront/hooks/useProducts';
import { useUrlFilters, type CatalogFilters } from '../../lib/storefront/hooks/useUrlFilters';
import { useCollections } from '../../lib/storefront/hooks/useCollections';
import { useFilters } from '../../lib/storefront/hooks/useFilters';
import type { Product } from '../../lib/storefront/types';
import { ProductCard } from './ProductCard';
import { PriceRangeFilter } from './PriceRangeFilter';

// --- Pagination Bar ---

interface PaginationBarProps {
  currentPage: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | 'ellipsis')[] = [1];
  if (current > 3) pages.push('ellipsis');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push('ellipsis');
  pages.push(total);
  return pages;
}

function PaginationBar({ currentPage, totalPages, total, onPageChange }: PaginationBarProps) {
  if (totalPages <= 1) return null;

  const pages = getPageNumbers(currentPage, totalPages);

  const btnBase =
    'inline-flex items-center justify-center w-10 h-10 rounded-[var(--radius-base)] text-sm font-medium transition-colors';
  const btnActive = `${btnBase} bg-[rgb(var(--color-primary-rgb))] text-[var(--color-button-text)]`;
  const btnInactive = `${btnBase} text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]`;
  const btnDisabled = `${btnBase} text-[var(--color-text-muted)] opacity-40 cursor-not-allowed`;

  return (
    <div className="flex items-center justify-center gap-1 mt-8 flex-wrap">
      {/* Prev */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className={currentPage <= 1 ? btnDisabled : btnInactive}
        aria-label="Предыдущая страница"
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Page numbers */}
      {pages.map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`e${i}`} className="w-10 h-10 inline-flex items-center justify-center text-sm text-[var(--color-text-muted)]">
            ...
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={p === currentPage ? btnActive : btnInactive}
            aria-current={p === currentPage ? 'page' : undefined}
          >
            {p}
          </button>
        ),
      )}

      {/* Next */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className={currentPage >= totalPages ? btnDisabled : btnInactive}
        aria-label="Следующая страница"
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Total count */}
      <span className="ml-4 text-sm text-[var(--color-text-muted)]">
        {total} товаров
      </span>
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

// --- Availability Select ---

const AVAILABILITY_OPTIONS = [
  { value: 'all', label: 'Все' },
  { value: 'in_stock', label: 'В наличии' },
  { value: 'sold_out', label: 'Нет в наличии' },
] as const;

interface AvailabilitySelectProps {
  value: string;
  onChange: (v: string) => void;
}

function AvailabilitySelect({ value, onChange }: AvailabilitySelectProps) {
  return (
    <select
      value={value || 'all'}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-base)] bg-[var(--color-background)] text-sm text-[var(--color-text)] font-[family-name:var(--font-body)] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-primary-rgb))]"
    >
      {AVAILABILITY_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// --- Variant Filter Select ---

interface VariantFilterSelectProps {
  name: string;
  values: string[];
  selected?: string;
  onChange: (value: string | undefined) => void;
}

function VariantFilterSelect({ name, values, selected, onChange }: VariantFilterSelectProps) {
  return (
    <select
      value={selected || ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-base)] bg-[var(--color-background)] text-sm text-[var(--color-text)] font-[family-name:var(--font-body)] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-primary-rgb))]"
    >
      <option value="">{name}</option>
      {values.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );
}

// --- Filter Bar ---

interface FilterBarProps {
  filters: CatalogFilters;
  setFilters: (update: Partial<CatalogFilters>) => void;
  resetFilters: () => void;
  variantGroups: { name: string; values: string[] }[];
  hasActiveFilters: boolean;
}

function FilterBar({ filters, setFilters, resetFilters, variantGroups, hasActiveFilters }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      {/* Availability */}
      <AvailabilitySelect
        value={filters.availability || 'all'}
        onChange={(v) => setFilters({ availability: v as CatalogFilters['availability'] })}
      />

      {/* Dynamic variant filters */}
      {variantGroups.map((group) => (
        <VariantFilterSelect
          key={group.name}
          name={group.name}
          values={group.values}
          selected={filters.variantFilters?.[group.name]}
          onChange={(value) => {
            const next = { ...(filters.variantFilters || {}) };
            if (value) {
              next[group.name] = value;
            } else {
              delete next[group.name];
            }
            setFilters({
              variantFilters: Object.keys(next).length > 0 ? next : undefined,
            });
          }}
        />
      ))}

      {/* Price range inline */}
      <PriceRangeFilter
        priceMin={filters.priceMin}
        priceMax={filters.priceMax}
        onChange={(min, max) => setFilters({ priceMin: min, priceMax: max })}
      />

      {/* Reset */}
      {hasActiveFilters && (
        <button
          onClick={resetFilters}
          className="px-3 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors underline"
        >
          Сбросить
        </button>
      )}
    </div>
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
  const { data: filtersData } = useFilters(filters);

  // Resolve collectionSlug -> collectionId
  useEffect(() => {
    if (collectionSlug && collections.length > 0 && !filters.collectionId) {
      const found = collections.find((c) => c.handle === collectionSlug);
      if (found) {
        setFilters({ collectionId: found.id });
      }
    }
  }, [collectionSlug, collections, filters.collectionId, setFilters]);

  const { products, total, pagination, isLoading, isError, error } = useProducts(filters);

  const variantGroups = filtersData?.variantGroups ?? [];

  const hasActiveFilters = !!(
    filters.collectionId ||
    filters.priceMin !== undefined ||
    filters.priceMax !== undefined ||
    filters.sort !== 'newest' ||
    (filters.availability && filters.availability !== 'all') ||
    (filters.variantFilters && Object.keys(filters.variantFilters).length > 0)
  );

  // Scroll to top on page change
  useEffect(() => {
    if (filters.page > 1) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [filters.page]);

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
      {/* Toolbar: count + sort */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[var(--color-text-muted)]">
          Найдено {total} товаров
        </p>
        <SortSelect
          value={filters.sort}
          onChange={(sort) => setFilters({ sort: sort as CatalogFilters['sort'] })}
        />
      </div>

      {/* Filter bar */}
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        resetFilters={resetFilters}
        variantGroups={variantGroups}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Content area */}
      <div className="flex gap-8">
        {/* Collections sidebar - desktop */}
        {showCollectionFilter && (
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <div className="sticky top-24">
              {collections.length > 0 && (
                <>
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
                </>
              )}
            </div>
          </aside>
        )}

        {/* Product grid */}
        <div className="flex-1">
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

          {/* Pagination */}
          <PaginationBar
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            total={total}
            onPageChange={(page) => setFilters({ page })}
          />
        </div>
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
    return <SkeletonGrid />;
  }

  return (
    <StoreProvider config={config}>
      <CatalogInner {...props} />
    </StoreProvider>
  );
}
