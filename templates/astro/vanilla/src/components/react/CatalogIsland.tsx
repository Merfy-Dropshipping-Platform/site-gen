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

// --- Skeleton ---

function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="flex-1">
      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ columnGap: 16, rowGap: 40 }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div style={{ aspectRatio: '1/1', backgroundColor: 'rgb(var(--color-foreground) / 0.05)', borderRadius: 0 }} />
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
        className="font-[family-name:var(--font-body)]"
        style={{ fontSize: 16, lineHeight: '22px', color: 'rgb(var(--color-foreground))', marginBottom: 12 }}
      >
        Коллекции
      </h3>
      <div
        className="flex flex-col"
        style={{ gap: 12, padding: 12, borderRadius: 8, backgroundColor: 'rgb(var(--color-background))' }}
      >
        <label className="flex items-center cursor-pointer" style={{ gap: 8 }}>
          <span className="flex items-center justify-center shrink-0" style={{ width: 24, height: 24 }}>
            <span
              className="rounded-full flex items-center justify-center"
              style={{ width: 18, height: 18, border: `2px solid ${!selected ? 'rgb(var(--color-foreground))' : 'rgb(var(--color-muted))'}` }}
            >
              {!selected && (
                <span className="rounded-full" style={{ width: 8, height: 8, backgroundColor: 'rgb(var(--color-foreground))' }} />
              )}
            </span>
          </span>
          <span
            className="font-[family-name:var(--font-body)]"
            style={{ fontSize: 16, lineHeight: '22px', color: !selected ? 'rgb(var(--color-foreground))' : 'rgb(var(--color-muted))' }}
          >
            Все
          </span>
          <input
            type="radio"
            name="collection"
            checked={!selected}
            onChange={() => onChange(undefined)}
            className="sr-only"
          />
        </label>
        {collections.map((c) => {
          const isActive = selected === c.id;
          return (
            <label key={c.id} className="flex items-center cursor-pointer" style={{ gap: 8 }}>
              <span className="flex items-center justify-center shrink-0" style={{ width: 24, height: 24 }}>
                <span
                  className="rounded-full flex items-center justify-center"
                  style={{ width: 18, height: 18, border: `2px solid ${isActive ? 'rgb(var(--color-foreground))' : 'rgb(var(--color-muted))'}` }}
                >
                  {isActive && (
                    <span className="rounded-full" style={{ width: 8, height: 8, backgroundColor: 'rgb(var(--color-foreground))' }} />
                  )}
                </span>
              </span>
              <span
                className="font-[family-name:var(--font-body)]"
                style={{ fontSize: 16, lineHeight: '22px', color: isActive ? 'rgb(var(--color-foreground))' : 'rgb(var(--color-muted))' }}
              >
                {c.title || (c as any).name}
              </span>
              <input
                type="radio"
                name="collection"
                checked={isActive}
                onChange={() => onChange(c.id)}
                className="sr-only"
              />
            </label>
          );
        })}
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
        <div className="flex flex-col" style={{ gap: 16 }}>
          {/* Sort */}
          <SortRadios
            value={filters.sort}
            onChange={(sort) => setFilters({ sort: sort as CatalogFilters['sort'] })}
          />

          {/* Availability */}
          <AvailabilityRadio
            value={filters.availability || 'all'}
            onChange={(v) => setFilters({ availability: v as CatalogFilters['availability'] })}
          />

          {/* Collections */}
          <CollectionFilter
            collections={collections}
            selected={filters.collectionId}
            onChange={(collectionId) => setFilters({ collectionId, page: 1 })}
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
          fontSize: 16, lineHeight: '22px',
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
        <div className="flex flex-col" style={{ gap: 16, padding: '15px 0' }}>
          <SortRadios
            value={filters.sort}
            onChange={(sort) => setFilters({ sort: sort as CatalogFilters['sort'] })}
          />
          <AvailabilityRadio
            value={filters.availability || 'all'}
            onChange={(v) => setFilters({ availability: v as CatalogFilters['availability'] })}
          />
          <CollectionFilter
            collections={collections}
            selected={filters.collectionId}
            onChange={(collectionId) => setFilters({ collectionId, page: 1 })}
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
              style={{ fontSize: 16, color: 'rgb(var(--color-muted))' }}
            >
              Сбросить все
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// --- Bottom Bar with "Load More" button + total count ---

interface BottomBarProps {
  currentPage: number;
  totalPages: number;
  total: number;
  isLoading: boolean;
  onLoadMore: () => void;
}

function BottomBar({ currentPage, totalPages, total, isLoading, onLoadMore }: BottomBarProps) {
  const hasMore = currentPage < totalPages;

  return (
    <div
      className="flex items-center justify-between font-[family-name:var(--font-body)]"
      style={{ marginTop: 40 }}
    >
      {/* Load more button */}
      <div>
        {hasMore && (
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="font-[family-name:var(--font-body)] uppercase"
            style={{
              height: 48,
              padding: '0 32px',
              backgroundColor: 'rgb(var(--color-button, var(--color-foreground)))',
              color: 'rgb(var(--color-background))',
              fontSize: 16,
              lineHeight: '48px',
              border: 'none',
              cursor: isLoading ? 'wait' : 'pointer',
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? 'Загрузка...' : 'Смотреть ещё'}
          </button>
        )}
      </div>

      {/* Total count */}
      <span style={{ fontSize: 16, color: 'rgb(var(--color-muted))' }}>
        {total} товаров
      </span>
    </div>
  );
}

// --- Main CatalogInner ---

interface CatalogInnerProps {
  collectionSlug?: string;
  showCollectionFilter?: boolean;
  cardStyle?: 'auto' | 'portrait' | 'square' | 'wide';
  initialProducts?: Product[];
  initialTotal?: number;
  initialCollections?: { id: string; handle: string; title?: string; name?: string }[];
  initialCollectionId?: string;
}

function CatalogInner({
  collectionSlug,
  showCollectionFilter = true,
  cardStyle,
  initialProducts = [],
  initialTotal = 0,
  initialCollections = [],
  initialCollectionId,
}: CatalogInnerProps) {
  const { filters, setFilters, resetFilters } = useUrlFilters();
  const { collections: liveCollections } = useCollections();
  const collections = liveCollections.length > 0 ? liveCollections : initialCollections as any;
  const { data: filtersData } = useFilters(filters);

  // Resolve collectionSlug -> collectionId
  useEffect(() => {
    if (initialCollectionId && !filters.collectionId) {
      setFilters({ collectionId: initialCollectionId });
      return;
    }
    if (collectionSlug && collections.length > 0 && !filters.collectionId) {
      const found = collections.find((c: any) => c.handle === collectionSlug || c.slug === collectionSlug);
      if (found) {
        setFilters({ collectionId: found.id });
      }
    }
  }, [collectionSlug, collections, filters.collectionId, initialCollectionId, setFilters]);

  const isDefaultFilters = filters.page === 1
    && (filters.sort === 'newest' || filters.sort === undefined)
    && filters.priceMin === undefined
    && filters.priceMax === undefined
    && (!filters.availability || filters.availability === 'all')
    && (!filters.variantFilters || Object.keys(filters.variantFilters).length === 0)
    && (initialCollectionId ? filters.collectionId === initialCollectionId : !filters.collectionId);

  const { products: liveProducts, total: liveTotal, pagination, isLoading, isFetching, isError, error } = useProducts(filters, {
    initialData: isDefaultFilters && initialProducts.length > 0
      ? {
          products: initialProducts,
          total: initialTotal,
          pagination: { page: 1, limit: PAGE_SIZE, total: initialTotal, totalPages: Math.ceil(initialTotal / PAGE_SIZE) },
        }
      : undefined,
  });

  // Until React Query has fetched fresh data and we're on default filters,
  // show the build-time products so the first paint isn't a full skeleton.
  const useInitial = isDefaultFilters && liveProducts.length === 0 && initialProducts.length > 0;
  const products = useInitial ? initialProducts : liveProducts;
  const total = useInitial ? initialTotal : liveTotal;
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

  // Product grid content
  const renderProductGrid = () => {
    // Skeleton only when we genuinely have nothing to show — i.e. live API
    // is loading AND there's no build-time fallback either.
    if (isLoading && products.length === 0 && !useInitial) {
      return (
        <div className="flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2" style={{ columnGap: 16, rowGap: 40 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div style={{ aspectRatio: '1/1', backgroundColor: 'rgb(var(--color-foreground) / 0.05)', borderRadius: 0 }} />
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
          <p className="font-[family-name:var(--font-body)]" style={{ fontSize: 16, color: 'rgb(var(--color-muted))', marginBottom: 16 }}>
            Произошла ошибка при загрузке товаров
          </p>
          {error?.message && (
            <p className="font-[family-name:var(--font-body)]" style={{ fontSize: 14, color: 'rgb(var(--color-muted))', marginBottom: 16 }}>{error.message}</p>
          )}
          <button
            onClick={() => window.location.reload()}
            className="font-[family-name:var(--font-body)]"
            style={{
              padding: '12px 24px',
              border: '1px solid rgb(var(--color-muted))',
              borderRadius: 0,
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
          <p className="font-[family-name:var(--font-body)]" style={{ fontSize: 16, color: 'rgb(var(--color-muted))', marginBottom: 16 }}>
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
                borderRadius: 0,
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
          className="grid grid-cols-1 sm:grid-cols-2"
          style={{ columnGap: 16, rowGap: 40 }}
        >
          {products.map((product) => (
            <ProductCard key={product.id} product={product} cardStyle={cardStyle} />
          ))}
        </div>

        <BottomBar
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          total={total}
          isLoading={isFetching}
          onLoadMore={() => setFilters({ page: pagination.page + 1 })}
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

      {/* Main layout: sidebar + grid */}
      <div className="flex" style={{ gap: 40 }}>
        {/* Filter Sidebar — desktop (includes sort, availability, collections, price) */}
        <FilterSidebar filters={filters} setFilters={setFilters} variantGroups={variantGroups} collections={collections} />

        {/* Product grid + bottom bar */}
        {renderProductGrid()}
      </div>

      {/* Reset link */}
      {hasActiveFilters && (
        <div className="mt-6 text-center lg:text-left" style={{ paddingLeft: 334 }}>
          <button
            onClick={resetFilters}
            className="font-[family-name:var(--font-body)] underline"
            style={{ fontSize: 16, color: 'rgb(var(--color-muted))' }}
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
  cardStyle?: 'auto' | 'portrait' | 'square' | 'wide';
  /** Server-side props from Astro page — make first paint instant. */
  shopId?: string;
  apiBase?: string;
  initialProducts?: Product[];
  initialTotal?: number;
  initialCollections?: { id: string; handle: string; title?: string; name?: string }[];
  initialCollectionId?: string;
}

export default function CatalogIsland(props: CatalogIslandProps) {
  // Prefer Astro-passed props (works on SSR + first paint); fall back to
  // window.__MERFY_CONFIG__ for backwards compatibility.
  const propConfig = props.shopId && props.apiBase
    ? { apiBase: props.apiBase, storeId: props.shopId }
    : null;
  const winConfig = typeof window !== 'undefined' && (window as any).__MERFY_CONFIG__
    ? {
        apiBase: (window as any).__MERFY_CONFIG__.apiUrl || 'https://gateway.merfy.ru/api',
        storeId: (window as any).__MERFY_CONFIG__.shopId || '',
      }
    : null;
  const resolved = propConfig ?? winConfig;
  const config = resolved
    ? { ...resolved, currency: 'RUB', locale: 'ru-RU' }
    : { apiBase: '', storeId: '', currency: 'RUB', locale: 'ru-RU' };

  if (!config.storeId) {
    // No storeId at all — show build-time products if available, otherwise
    // fall back to the loader skeleton.
    if (props.initialProducts && props.initialProducts.length > 0) {
      return (
        <div className="flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2" style={{ columnGap: 16, rowGap: 40 }}>
            {props.initialProducts.slice(0, 8).map((p) => (
              <ProductCard key={p.id} product={p} cardStyle={props.cardStyle} />
            ))}
          </div>
        </div>
      );
    }
    return <SkeletonGrid />;
  }

  return (
    <StoreProvider config={config}>
      <CatalogInner {...props} />
    </StoreProvider>
  );
}
