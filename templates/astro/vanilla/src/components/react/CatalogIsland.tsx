import React, { useEffect } from 'react';
import { StoreProvider } from '../../lib/storefront/provider';
import { useProducts, PAGE_SIZE } from '../../lib/storefront/hooks/useProducts';
import { useUrlFilters, type CatalogFilters } from '../../lib/storefront/hooks/useUrlFilters';
import { useCollections } from '../../lib/storefront/hooks/useCollections';
import { useFilters } from '../../lib/storefront/hooks/useFilters';
import type { Product } from '../../lib/storefront/types';
import { ProductCard } from './ProductCard';
import { PriceRangeFilter } from './PriceRangeFilter';
import { AvailabilityRadio } from './AvailabilityRadio';
import { ColorFilterDropdown } from './ColorFilterDropdown';
import { SortRadios } from './SortRadios';

// --- Pagination Bar (redesigned) ---

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
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 2) pages.push('ellipsis');
  pages.push(total);
  return pages;
}

function PaginationBar({ currentPage, totalPages, total, onPageChange }: PaginationBarProps) {
  if (totalPages <= 1) return null;

  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <div
      className="flex items-center justify-between font-[family-name:var(--font-body)]"
      style={{ marginTop: 40 }}
    >
      {/* Left arrow */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="flex items-center justify-center w-10 h-10 sm:w-[60px] sm:h-[60px]"
        style={{
          color: currentPage <= 1 ? 'rgb(var(--color-muted))' : 'rgb(var(--color-foreground))',
          opacity: currentPage <= 1 ? 0.4 : 1,
          cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
        }}
        aria-label="Предыдущая страница"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      {/* Page numbers */}
      <div className="flex items-center" style={{ gap: 2 }}>
        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <span
              key={`e${i}`}
              className="flex items-center justify-center w-10 h-10 sm:w-[60px] sm:h-[60px] text-base sm:text-2xl"
              style={{ lineHeight: '33px', color: 'rgb(var(--color-muted))' }}
            >
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className="flex items-center justify-center w-10 h-10 sm:w-[60px] sm:h-[60px] text-base sm:text-2xl"
              style={{
                lineHeight: '33px',
                color: p === currentPage ? 'rgb(var(--color-foreground))' : 'rgb(var(--color-muted))',
                cursor: 'pointer',
              }}
              aria-current={p === currentPage ? 'page' : undefined}
            >
              {p}
            </button>
          ),
        )}
      </div>

      {/* Right arrow */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="flex items-center justify-center w-10 h-10 sm:w-[60px] sm:h-[60px]"
        style={{
          color: currentPage >= totalPages ? 'rgb(var(--color-muted))' : 'rgb(var(--color-foreground))',
          opacity: currentPage >= totalPages ? 0.4 : 1,
          cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
        }}
        aria-label="Следующая страница"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      {/* Total count — hidden on mobile (already shown in toolbar) */}
      <span className="hidden sm:inline" style={{ fontSize: 20, lineHeight: '27px', color: 'rgb(var(--color-muted))', marginLeft: 20 }}>
        {total} товаров
      </span>
    </div>
  );
}

// --- Skeleton ---

function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="flex-1">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2" style={{ gap: 16 }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div style={{ aspectRatio: '1/1', backgroundColor: '#FBFBFB', borderRadius: 0 }} />
            <div className="mt-4 rounded-none h-5 w-3/4" style={{ background: 'rgb(var(--color-foreground) / 0.06)' }} />
            <div className="mt-2 rounded-none h-6 w-1/3" style={{ background: 'rgb(var(--color-foreground) / 0.06)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Filter Sidebar ---

interface CollectionFilterProps {
  collections: { id: string; title?: string; name?: string }[];
  selected?: string;
  onChange: (collectionId?: string) => void;
}

function CollectionFilter({ collections, selected, onChange }: CollectionFilterProps) {
  if (collections.length === 0) return null;

  return (
    <div>
      <h3
        className="font-[family-name:var(--font-heading)]"
        style={{ fontSize: 20, lineHeight: '27px', color: 'rgb(var(--color-foreground))', marginBottom: 15 }}
      >
        Коллекции
      </h3>
      <div className="flex flex-col" style={{ gap: 10 }}>
        <label className="flex items-center cursor-pointer" style={{ gap: 10 }}>
          <span
            className="font-[family-name:var(--font-body)]"
            style={{ fontSize: 18, lineHeight: '24px', color: 'rgb(var(--color-foreground))' }}
          >
            Все
          </span>
          <input
            type="radio"
            name="collection"
            checked={!selected}
            onChange={() => onChange(undefined)}
            className="accent-current"
          />
        </label>
        {collections.map((c) => (
          <label key={c.id} className="flex items-center cursor-pointer" style={{ gap: 10 }}>
            <span
              className="font-[family-name:var(--font-body)]"
              style={{ fontSize: 18, lineHeight: '24px', color: 'rgb(var(--color-foreground))' }}
            >
              {c.title || (c as any).name}
            </span>
            <input
              type="radio"
              name="collection"
              checked={selected === c.id}
              onChange={() => onChange(c.id)}
              className="accent-current"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

interface FilterSidebarProps {
  filters: CatalogFilters;
  setFilters: (update: Partial<CatalogFilters>) => void;
  variantGroups: { name: string; values: string[] }[];
  collections: { id: string; title?: string; name?: string }[];
}

function FilterSidebar({ filters, setFilters, variantGroups, collections }: FilterSidebarProps) {
  // Extract color group if it exists
  const colorGroup = variantGroups.find(
    (g) => g.name.toLowerCase() === 'цвет' || g.name.toLowerCase() === 'color',
  );
  const colorSelected = colorGroup ? filters.variantFilters?.[colorGroup.name] : undefined;

  return (
    <aside
      className="hidden lg:block shrink-0"
      style={{ width: 294 }}
    >
      <div className="sticky" style={{ top: 100 }}>
        {/* Label */}
        <p
          className="font-[family-name:var(--font-body)]"
          style={{ fontSize: 20, lineHeight: '27px', color: 'rgb(var(--color-muted))', marginBottom: 25 }}
        >
          Фильтры:
        </p>

        <div className="flex flex-col" style={{ gap: 50 }}>
          {/* Collections */}
          <CollectionFilter
            collections={collections}
            selected={filters.collectionId}
            onChange={(collectionId) => setFilters({ collectionId, page: 1 })}
          />

          {/* Availability */}
          <AvailabilityRadio
            value={filters.availability || 'all'}
            onChange={(v) => setFilters({ availability: v as CatalogFilters['availability'] })}
          />

          {/* Price */}
          <PriceRangeFilter
            priceMin={filters.priceMin}
            priceMax={filters.priceMax}
            onChange={(min, max) => setFilters({ priceMin: min, priceMax: max })}
          />

          {/* Color dropdown */}
          {colorGroup && (
            <ColorFilterDropdown
              colors={colorGroup.values}
              selected={colorSelected}
              onChange={(color) => {
                const next = { ...(filters.variantFilters || {}) };
                if (color) {
                  next[colorGroup.name] = color;
                } else {
                  delete next[colorGroup.name];
                }
                setFilters({
                  variantFilters: Object.keys(next).length > 0 ? next : undefined,
                });
              }}
            />
          )}
        </div>
      </div>
    </aside>
  );
}

// --- Mobile Filters (collapsible) ---

interface MobileFiltersProps {
  filters: CatalogFilters;
  setFilters: (update: Partial<CatalogFilters>) => void;
  variantGroups: { name: string; values: string[] }[];
  collections: { id: string; title?: string; name?: string }[];
  hasActiveFilters: boolean;
  resetFilters: () => void;
}

function MobileFilters({ filters, setFilters, variantGroups, collections, hasActiveFilters, resetFilters }: MobileFiltersProps) {
  const [open, setOpen] = React.useState(false);
  const colorGroup = variantGroups.find(
    (g) => g.name.toLowerCase() === 'цвет' || g.name.toLowerCase() === 'color',
  );
  const colorSelected = colorGroup ? filters.variantFilters?.[colorGroup.name] : undefined;

  return (
    <div className="lg:hidden" style={{ marginBottom: 20 }}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center font-[family-name:var(--font-body)]"
        style={{
          fontSize: 18, lineHeight: '24px',
          color: 'rgb(var(--color-foreground))',
          gap: 8,
          padding: '10px 0',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
        </svg>
        Фильтры
        {hasActiveFilters && (
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'rgb(var(--color-foreground))' }} />
        )}
      </button>

      {open && (
        <div className="flex flex-col" style={{ gap: 30, padding: '15px 0' }}>
          <CollectionFilter
            collections={collections}
            selected={filters.collectionId}
            onChange={(collectionId) => setFilters({ collectionId, page: 1 })}
          />
          <AvailabilityRadio
            value={filters.availability || 'all'}
            onChange={(v) => setFilters({ availability: v as CatalogFilters['availability'] })}
          />
          <PriceRangeFilter
            priceMin={filters.priceMin}
            priceMax={filters.priceMax}
            onChange={(min, max) => setFilters({ priceMin: min, priceMax: max })}
          />
          {colorGroup && (
            <ColorFilterDropdown
              colors={colorGroup.values}
              selected={colorSelected}
              onChange={(color) => {
                const next = { ...(filters.variantFilters || {}) };
                if (color) {
                  next[colorGroup.name] = color;
                } else {
                  delete next[colorGroup.name];
                }
                setFilters({
                  variantFilters: Object.keys(next).length > 0 ? next : undefined,
                });
              }}
            />
          )}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="font-[family-name:var(--font-body)] underline"
              style={{ fontSize: 18, color: 'rgb(var(--color-muted))' }}
            >
              Сбросить все
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main CatalogInner ---

interface CatalogInnerProps {
  collectionSlug?: string;
  showCollectionFilter?: boolean;
}

function CatalogInner({ collectionSlug, showCollectionFilter = true }: CatalogInnerProps) {
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

  const { products, total, pagination, isLoading, isFetching, isError, error } = useProducts(filters);
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

  // Product grid content — skeleton only on first load, opacity on refetch
  const renderProductGrid = () => {
    if (isLoading && products.length === 0) {
      return (
        <div className="flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2" style={{ gap: 16 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div style={{ aspectRatio: '1/1', backgroundColor: '#FBFBFB', borderRadius: 0 }} />
                <div className="mt-4 rounded-none h-5 w-3/4" style={{ background: 'rgb(var(--color-foreground) / 0.06)' }} />
                <div className="mt-2 rounded-none h-6 w-1/3" style={{ background: 'rgb(var(--color-foreground) / 0.06)' }} />
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (isError) {
      return (
        <div className="flex-1 py-12 text-center">
          <p className="font-[family-name:var(--font-body)]" style={{ fontSize: 20, color: 'rgb(var(--color-muted))', marginBottom: 16 }}>
            Произошла ошибка при загрузке товаров
          </p>
          {error?.message && (
            <p className="font-[family-name:var(--font-body)]" style={{ fontSize: 16, color: 'rgb(var(--color-muted))', marginBottom: 16 }}>{error.message}</p>
          )}
          <button
            onClick={() => window.location.reload()}
            className="font-[family-name:var(--font-body)]"
            style={{
              padding: '12px 24px',
              border: '1px solid rgb(var(--color-muted))',
              borderRadius: 10,
              fontSize: 16,
              color: 'rgb(var(--color-foreground))',
            }}
          >
            Попробовать снова
          </button>
        </div>
      );
    }

    if (products.length === 0) {
      return (
        <div className="flex-1 py-12 text-center">
          <p className="font-[family-name:var(--font-body)]" style={{ fontSize: 20, color: 'rgb(var(--color-muted))', marginBottom: 16 }}>
            Товаров не найдено
          </p>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="font-[family-name:var(--font-body)]"
              style={{
                padding: '12px 24px',
                backgroundColor: 'rgb(var(--color-foreground))',
                color: 'rgb(var(--color-background))',
                borderRadius: 10,
                fontSize: 16,
              }}
            >
              Сбросить все фильтры
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="flex-1" style={{ opacity: isFetching ? 0.5 : 1, transition: 'opacity 0.2s ease' }}>
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2"
          style={{ gap: 16 }}
        >
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        <PaginationBar
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          total={total}
          onPageChange={(page) => setFilters({ page })}
        />
      </div>
    );
  };

  return (
    <>
      {/* Mobile filters */}
      <MobileFilters
        filters={filters}
        setFilters={setFilters}
        variantGroups={variantGroups}
        collections={collections}
        hasActiveFilters={hasActiveFilters}
        resetFilters={resetFilters}
      />

      {/* Sort + count toolbar */}
      <div className="flex items-center justify-between" style={{ marginBottom: 30 }}>
        <span
          className="font-[family-name:var(--font-body)] hidden sm:inline"
          style={{ fontSize: 20, lineHeight: '27px', color: 'rgb(var(--color-muted))' }}
        >
          {total} товаров
        </span>
        <SortRadios
          value={filters.sort}
          onChange={(sort) => setFilters({ sort: sort as CatalogFilters['sort'] })}
        />
      </div>

      {/* Main layout: sidebar + grid */}
      <div className="flex" style={{ gap: 104 }}>
        {/* Filter Sidebar — desktop (always visible) */}
        <FilterSidebar filters={filters} setFilters={setFilters} variantGroups={variantGroups} collections={collections} />

        {/* Product grid + pagination */}
        {renderProductGrid()}
      </div>

      {/* Reset link */}
      {hasActiveFilters && (
        <div className="mt-6 text-center lg:text-left lg:pl-[335px]">
          <button
            onClick={resetFilters}
            className="font-[family-name:var(--font-body)] underline"
            style={{ fontSize: 18, color: 'rgb(var(--color-muted))' }}
          >
            Сбросить все фильтры
          </button>
        </div>
      )}
    </>
  );
}

// --- Exported CatalogIsland ---

export interface CatalogIslandProps {
  collectionSlug?: string;
  showCollectionFilter?: boolean;
}

export default function CatalogIsland(props: CatalogIslandProps) {
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
