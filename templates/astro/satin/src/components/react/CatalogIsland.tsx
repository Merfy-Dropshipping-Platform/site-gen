import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StoreProvider } from '../../lib/storefront/provider';
import { useProducts } from '../../lib/storefront/hooks/useProducts';
import { useUrlFilters, type CatalogFilters } from '../../lib/storefront/hooks/useUrlFilters';
import { useCollections } from '../../lib/storefront/hooks/useCollections';
import { useFilters } from '../../lib/storefront/hooks/useFilters';
import type { Product } from '../../lib/storefront/types';
import { ProductCard } from './ProductCard';

// --- Filter Dropdown wrapper (per Figma 897:11521 toolbar) ---

interface FilterDropdownProps {
  id: string;
  label: string;
  openId: string | null;
  onToggle: (id: string | null) => void;
  active?: boolean;
  width?: number;
  align?: 'left' | 'right';
  children: React.ReactNode;
}

function FilterDropdown({
  id,
  label,
  openId,
  onToggle,
  active = false,
  width = 180,
  align = 'left',
  children,
}: FilterDropdownProps) {
  const open = openId === id;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onToggle(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onToggle]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => onToggle(open ? null : id)}
        className="flex items-center font-[family-name:var(--font-body)] uppercase"
        style={{
          fontSize: 16,
          lineHeight: 1.2,
          color: 'rgb(var(--color-foreground))',
          opacity: active ? 1 : 0.95,
          gap: 4,
          padding: '4px 0',
        }}
      >
        <span>{label}</span>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute z-20"
          style={{
            top: 'calc(100% + 4px)',
            [align]: 0,
            width,
            padding: 12,
            backgroundColor: 'rgb(var(--color-background))',
            border: '1px solid rgb(var(--color-foreground) / 0.08)',
            borderRadius: 'var(--radius-card, 0px)',
            boxShadow: '0 4px 24px -8px rgb(var(--color-foreground) / 0.08)',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// --- Filter content per Figma 897:11566 / 11567 / 11568 ---
// Minimal vertical text lists (Bloom font tokens kept) — replaces the
// fuller AvailabilityRadio / PriceRangeFilter / ColorFilterDropdown
// components in the catalog popovers.

const AVAILABILITY_OPTIONS: { value: CatalogFilters['availability']; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'in_stock', label: 'В наличии' },
  { value: 'sold_out', label: 'Распродано' },
];

function AvailabilityList({
  value,
  onChange,
}: {
  value: CatalogFilters['availability'];
  onChange: (v: CatalogFilters['availability']) => void;
}) {
  const current = value || 'all';
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      {AVAILABILITY_OPTIONS.map((opt) => {
        const active = current === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="text-left font-[family-name:var(--font-body)] uppercase"
            style={{
              fontSize: 14,
              lineHeight: 1.2,
              color: active ? 'rgb(var(--color-foreground))' : 'rgb(var(--color-muted))',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function PriceInputsRow({
  label,
  value,
  active,
  onChange,
}: {
  label: string;
  value: string;
  active: boolean;
  onChange: (v: string) => void;
}) {
  const color = active ? 'rgb(var(--color-foreground))' : 'rgb(var(--color-muted))';
  return (
    <label
      className="flex items-center cursor-text"
      style={{
        height: 32,
        gap: 8,
        borderBottom: `1px solid ${color}`,
      }}
    >
      <span
        className="font-[family-name:var(--font-body)] uppercase shrink-0"
        style={{ fontSize: 14, color }}
      >
        {label}
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
        className="font-[family-name:var(--font-body)] text-right flex-1 min-w-0"
        style={{
          fontSize: 14,
          color,
          border: 'none',
          outline: 'none',
          backgroundColor: 'transparent',
          padding: 0,
        }}
      />
      <span
        className="font-[family-name:var(--font-body)] shrink-0"
        style={{ fontSize: 14, color }}
      >
        ₽
      </span>
    </label>
  );
}

function PriceInputs({
  priceMin,
  priceMax,
  onChange,
}: {
  priceMin?: number;
  priceMax?: number;
  onChange: (min?: number, max?: number) => void;
}) {
  const [minStr, setMinStr] = useState(priceMin?.toString() ?? '');
  const [maxStr, setMaxStr] = useState(priceMax?.toString() ?? '');
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setMinStr(priceMin?.toString() ?? '');
      setMaxStr(priceMax?.toString() ?? '');
    }
  }, [priceMin, priceMax]);

  useEffect(() => {
    const t = setTimeout(() => {
      let m = minStr ? Number(minStr) : undefined;
      let mx = maxStr ? Number(maxStr) : undefined;
      if (m !== undefined && mx !== undefined && m > mx) {
        const tmp = m;
        m = mx;
        mx = tmp;
      }
      onChange(m, mx);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minStr, maxStr]);

  return (
    <div
      className="flex flex-col"
      style={{ gap: 8 }}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
      }}
    >
      <PriceInputsRow label="от" value={minStr} active={minStr !== ''} onChange={setMinStr} />
      <PriceInputsRow label="до" value={maxStr} active={maxStr !== ''} onChange={setMaxStr} />
    </div>
  );
}

function ColorList({
  colors,
  selected,
  onChange,
}: {
  colors: string[];
  selected?: string;
  onChange: (color?: string) => void;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      {colors.map((color) => {
        const active = selected === color;
        return (
          <button
            key={color}
            type="button"
            onClick={() => onChange(active ? undefined : color)}
            className="text-left font-[family-name:var(--font-body)] uppercase"
            style={{
              fontSize: 14,
              lineHeight: 1.2,
              color: active ? 'rgb(var(--color-foreground))' : 'rgb(var(--color-muted))',
            }}
          >
            {color}
          </button>
        );
      })}
    </div>
  );
}

// --- Sort dropdown — same chevron pattern as filters, right-aligned ---

const SORT_OPTIONS = [
  { value: 'popular', label: 'По популярности' },
  { value: 'newest', label: 'По новизне' },
  { value: 'price_asc', label: 'Сначала дешевые' },
  { value: 'price_desc', label: 'Сначала дорогие' },
] as const;

function SortDropdownInline({
  value,
  onChange,
  openId,
  onToggle,
}: {
  value: string;
  onChange: (s: string) => void;
  openId: string | null;
  onToggle: (id: string | null) => void;
}) {
  const activeLabel = SORT_OPTIONS.find((o) => o.value === value)?.label ?? 'По популярности';

  return (
    <FilterDropdown
      id="sort"
      label={activeLabel}
      active
      align="right"
      width={180}
      openId={openId}
      onToggle={onToggle}
    >
      <div className="flex flex-col" style={{ gap: 8 }}>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              onChange(opt.value);
              onToggle(null);
            }}
            className="text-left font-[family-name:var(--font-body)] uppercase"
            style={{
              fontSize: 14,
              color: value === opt.value ? 'rgb(var(--color-foreground))' : 'rgb(var(--color-muted))',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </FilterDropdown>
  );
}

// --- Skeleton ---

function SkeletonGrid({ count = 9 }: { count?: number }) {
  return (
    <div className="flex-1">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ columnGap: 16, rowGap: 40 }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="animate-pulse flex flex-col" style={{ gap: 20 }}>
            <div style={{ aspectRatio: '429 / 564', backgroundColor: 'rgb(var(--color-foreground) / 0.05)' }} />
            <div className="h-5 w-3/4" style={{ background: 'rgb(var(--color-foreground) / 0.06)' }} />
            <div className="h-6 w-1/3" style={{ background: 'rgb(var(--color-foreground) / 0.06)' }} />
            <div className="h-12 w-full" style={{ background: 'rgb(var(--color-foreground) / 0.06)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Main CatalogInner ---

// Tailwind-safe lookup table — every class below must remain a literal string in
// source so the `lg:grid-cols-N` variants survive tree-shaking. Do not build the
// class via interpolation/template strings.
const LG_COLS_CLASS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
};

const SATIN_DEFAULT_COLUMNS = 3;

function resolveLgCols(columns?: number) {
  const n = Math.max(1, Math.min(6, Math.floor(columns ?? SATIN_DEFAULT_COLUMNS)));
  return LG_COLS_CLASS[n] ?? LG_COLS_CLASS[SATIN_DEFAULT_COLUMNS];
}

interface CatalogInnerProps {
  collectionSlug?: string;
  showCollectionFilter?: boolean;
  cardStyle?: 'auto' | 'portrait' | 'square' | 'wide';
  columns?: number;
  cards?: number;
}

function CatalogInner({ collectionSlug, cardStyle, columns, cards }: CatalogInnerProps) {
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

  const lgCols = resolveLgCols(columns);
  const { products, total, pagination, isLoading, isFetching, isError, error } = useProducts(filters, {
    pageSize: cards,
  });
  const variantGroups = filtersData?.variantGroups ?? [];

  const colorGroup = variantGroups.find(
    (g) => g.name.toLowerCase() === 'цвет' || g.name.toLowerCase() === 'color',
  );
  const colorSelected = colorGroup ? filters.variantFilters?.[colorGroup.name] : undefined;

  const hasActiveFilters = !!(
    filters.collectionId ||
    filters.priceMin !== undefined ||
    filters.priceMax !== undefined ||
    filters.sort !== 'newest' ||
    (filters.availability && filters.availability !== 'all') ||
    (filters.variantFilters && Object.keys(filters.variantFilters).length > 0)
  );

  // Accumulate products across pages for "Show More" semantics
  const [accumulated, setAccumulated] = useState<Product[]>([]);
  const filtersKey = useMemo(
    () =>
      JSON.stringify({
        collectionId: filters.collectionId,
        priceMin: filters.priceMin,
        priceMax: filters.priceMax,
        availability: filters.availability,
        sort: filters.sort,
        variantFilters: filters.variantFilters,
      }),
    [
      filters.collectionId,
      filters.priceMin,
      filters.priceMax,
      filters.availability,
      filters.sort,
      filters.variantFilters,
    ],
  );
  const prevFiltersKey = useRef(filtersKey);
  useEffect(() => {
    if (prevFiltersKey.current !== filtersKey) {
      prevFiltersKey.current = filtersKey;
      setAccumulated([]);
      if (filters.page !== 1) setFilters({ page: 1 });
    }
  }, [filtersKey, filters.page, setFilters]);

  useEffect(() => {
    if (isFetching) return;
    if (products.length === 0 && filters.page === 1) {
      setAccumulated([]);
      return;
    }
    setAccumulated((prev) => {
      if (filters.page === 1) return products;
      const prevIds = new Set(prev.map((p) => p.id));
      const newOnes = products.filter((p) => !prevIds.has(p.id));
      return newOnes.length === 0 ? prev : [...prev, ...newOnes];
    });
  }, [products, filters.page, isFetching]);

  const visibleProducts = accumulated.length > 0 || isLoading ? accumulated : products;
  const hasMore = pagination.totalPages > filters.page;

  const handleShowMore = () => {
    if (!hasMore) return;
    setFilters({ page: filters.page + 1 });
  };

  // Single shared "which dropdown is open" state — opening one closes others.
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // --- Render: Toolbar (Figma 897:11947) ---
  const renderToolbar = () => (
    <div
      className="flex flex-col sm:flex-row sm:items-end sm:justify-between"
      style={{ gap: 12 }}
    >
      <div className="flex flex-wrap items-end" style={{ gap: 12 }}>
        <FilterDropdown
          id="availability"
          label="Наличие"
          openId={openDropdownId}
          onToggle={setOpenDropdownId}
          active={!!filters.availability && filters.availability !== 'all'}
        >
          <AvailabilityList
            value={filters.availability || 'all'}
            onChange={(v) => setFilters({ availability: v })}
          />
        </FilterDropdown>

        <FilterDropdown
          id="price"
          label="Стоимость"
          openId={openDropdownId}
          onToggle={setOpenDropdownId}
          active={filters.priceMin !== undefined || filters.priceMax !== undefined}
        >
          <PriceInputs
            priceMin={filters.priceMin}
            priceMax={filters.priceMax}
            onChange={(min, max) => setFilters({ priceMin: min, priceMax: max })}
          />
        </FilterDropdown>

        {colorGroup && (
          <FilterDropdown
            id="color"
            label="Цвет"
            openId={openDropdownId}
            onToggle={setOpenDropdownId}
            active={!!colorSelected}
          >
            <ColorList
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
          </FilterDropdown>
        )}
      </div>

      <SortDropdownInline
        value={filters.sort}
        onChange={(sort) => setFilters({ sort: sort as CatalogFilters['sort'] })}
        openId={openDropdownId}
        onToggle={setOpenDropdownId}
      />
    </div>
  );

  // --- Render: Grid + Show More + Count ---
  const renderGrid = () => {
    if (isLoading && visibleProducts.length === 0) return <SkeletonGrid />;

    if (isError) {
      return (
        <div className="py-12 text-center">
          <p
            className="font-[family-name:var(--font-body)]"
            style={{ fontSize: 20, color: 'rgb(var(--color-muted))', marginBottom: 16 }}
          >
            Произошла ошибка при загрузке товаров
          </p>
          {error?.message && (
            <p
              className="font-[family-name:var(--font-body)]"
              style={{ fontSize: 16, color: 'rgb(var(--color-muted))', marginBottom: 16 }}
            >
              {error.message}
            </p>
          )}
          <button
            onClick={() => window.location.reload()}
            className="font-[family-name:var(--font-body)] uppercase"
            style={{
              padding: '12px 24px',
              border: '1px solid rgb(var(--color-foreground))',
              borderRadius: 'var(--radius-button, 0px)',
              fontSize: 16,
              color: 'rgb(var(--color-foreground))',
              backgroundColor: 'transparent',
            }}
          >
            Попробовать снова
          </button>
        </div>
      );
    }

    if (visibleProducts.length === 0) {
      return (
        <div className="py-12 text-center">
          <p
            className="font-[family-name:var(--font-body)]"
            style={{ fontSize: 20, color: 'rgb(var(--color-muted))', marginBottom: 16 }}
          >
            Товаров не найдено
          </p>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="font-[family-name:var(--font-body)] uppercase"
              style={{
                padding: '12px 24px',
                backgroundColor: 'rgb(var(--color-foreground))',
                color: 'rgb(var(--color-background))',
                borderRadius: 'var(--radius-button, 0px)',
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
      <>
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 ${lgCols}`}
          style={{
            columnGap: 16,
            rowGap: 40,
            opacity: isFetching && filters.page === 1 ? 0.5 : 1,
            transition: 'opacity 0.2s ease',
          }}
        >
          {visibleProducts.map((product) => (
            <ProductCard key={product.id} product={product} cardStyle={cardStyle} />
          ))}
        </div>

        {/* Show more + count — Figma 897:11549 */}
        <div
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between"
          style={{ marginTop: 40, gap: 16 }}
        >
          {hasMore ? (
            <button
              type="button"
              onClick={handleShowMore}
              disabled={isFetching}
              className="font-[family-name:var(--font-body)] uppercase self-start sm:self-auto"
              style={{
                height: 48,
                padding: '10px 16px',
                fontSize: 16,
                backgroundColor: 'rgb(var(--color-background))',
                color: 'rgb(var(--color-foreground))',
                border: '1px solid rgb(var(--color-foreground))',
                borderRadius: 'var(--radius-button, 0px)',
                cursor: isFetching ? 'progress' : 'pointer',
                opacity: isFetching ? 0.6 : 1,
              }}
            >
              {isFetching ? 'Загрузка…' : 'Смотреть ещё'}
            </button>
          ) : (
            <span />
          )}
          <span
            className="font-[family-name:var(--font-body)] uppercase"
            style={{ fontSize: 16, color: 'rgb(var(--color-foreground))' }}
          >
            {total} {pluralizeProducts(total)}
          </span>
        </div>
      </>
    );
  };

  return (
    <div className="flex flex-col" style={{ gap: 24 }}>
      {renderToolbar()}
      {renderGrid()}
      {hasActiveFilters && (
        <div className="text-center sm:text-left" style={{ marginTop: 8 }}>
          <button
            onClick={resetFilters}
            className="font-[family-name:var(--font-body)] underline"
            style={{ fontSize: 14, color: 'rgb(var(--color-muted))' }}
          >
            Сбросить все фильтры
          </button>
        </div>
      )}
    </div>
  );
}

function pluralizeProducts(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'товар';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'товара';
  return 'товаров';
}

// --- Exported CatalogIsland ---

export interface CatalogIslandProps {
  collectionSlug?: string;
  showCollectionFilter?: boolean;
  cardStyle?: 'auto' | 'portrait' | 'square' | 'wide';
  columns?: number;
  cards?: number;
}

export default function CatalogIsland(props: CatalogIslandProps) {
  // Resolve config from either __MERFY_CONFIG__ (preferred — emitted by build
  // pipeline scaffold) or __MERFY__.siteId (fallback — sites whose static
  // site-meta.js predates the __MERFY_CONFIG__ emission). Without this
  // fallback the React island gets stuck on the skeleton state on those
  // sites because storeId resolves to '' and the early-return short-
  // circuits the layout.
  const win = typeof window !== 'undefined' ? (window as any) : null;
  const cfgFromConfig = win?.__MERFY_CONFIG__;
  const cfgFromMerfy = win?.__MERFY__;
  const apiBase = cfgFromConfig?.apiUrl || 'https://gateway.merfy.ru/api';
  const storeId = cfgFromConfig?.shopId || cfgFromMerfy?.siteId || '';
  const config = { apiBase, storeId, currency: 'RUB', locale: 'ru-RU' };

  if (!config.storeId) {
    return <SkeletonGrid />;
  }

  return (
    <StoreProvider config={config}>
      <CatalogInner {...props} />
    </StoreProvider>
  );
}
