import { useState, useCallback } from 'react';
import { cn } from '../../../../packages/ui/lib/cn';
import { buttonVariants } from '../../../../packages/ui/variants/button';
import { inputVariants } from '../../../../packages/ui/variants/input';
import { formatMoney } from '../../../../packages/ui/lib/format';
import { useProducts, type UseProductsOptions } from '../../../../packages/storefront/hooks/useProducts';
import type { Collection } from '../../../../packages/storefront/types';

export interface ProductFilterProps {
  /** Available collections for filtering */
  collections?: Collection[];
  /** Available tags for filtering */
  tags?: string[];
  /** Initial filter options passed to useProducts */
  initialOptions?: UseProductsOptions;
}

interface FilterGroupProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * Collapsible filter group.
 */
function FilterGroup({ title, defaultOpen = true, children }: FilterGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[var(--color-border)] pb-4 mb-4 last:border-b-0 last:pb-0 last:mb-0">
      <button
        className="flex items-center justify-between w-full text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-[var(--color-text)]">
          {title}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={cn(
            'h-4 w-4 text-[var(--color-text-muted)] transition-transform duration-200',
            open && 'rotate-180',
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-300',
          open ? 'max-h-96 opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0',
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * ProductFilter React Island.
 * Faceted product filtering with collections, price range, and tags.
 * Hydrated with client:load for immediate filter interaction.
 *
 * Uses useProducts() hook for reactive filtering.
 * Filter changes automatically reset pagination to page 1.
 *
 * Responsive: sidebar on desktop, bottom sheet on mobile.
 */
export default function ProductFilter({
  collections = [],
  tags = [],
  initialOptions = {},
}: ProductFilterProps) {
  const { filters, setFilter, clearFilters } = useProducts(initialOptions);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Extract current filter values
  const activeCollectionId = filters.collection_id as string | undefined;
  const activePriceMin = filters.price_min as string | undefined;
  const activePriceMax = filters.price_max as string | undefined;
  const activeTags = (filters['tags[]'] as string[] | undefined) ?? [];

  const hasActiveFilters =
    !!activeCollectionId ||
    !!activePriceMin ||
    !!activePriceMax ||
    activeTags.length > 0;

  const activeFilterCount = [
    activeCollectionId,
    activePriceMin || activePriceMax ? 'price' : undefined,
    ...activeTags,
  ].filter(Boolean).length;

  // Collection filter handler
  const handleCollectionChange = useCallback(
    (collectionId: string | undefined) => {
      setFilter('collection_id', collectionId ?? '');
    },
    [setFilter],
  );

  // Price range handlers
  const handlePriceMinChange = useCallback(
    (value: string) => {
      setFilter('price_min', value);
    },
    [setFilter],
  );

  const handlePriceMaxChange = useCallback(
    (value: string) => {
      setFilter('price_max', value);
    },
    [setFilter],
  );

  // Tag toggle handler
  const handleTagToggle = useCallback(
    (tag: string) => {
      const current = activeTags;
      const next = current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag];
      setFilter('tags[]', next.length > 0 ? next : '');
    },
    [activeTags, setFilter],
  );

  // Clear all filters
  const handleClearAll = useCallback(() => {
    clearFilters();
  }, [clearFilters]);

  const filterContent = (
    <div className="space-y-0">
      {/* Header with clear button */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-[var(--color-text)] font-[family-name:var(--font-heading)]">
          Фильтры
          {activeFilterCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-[rgb(var(--color-primary-rgb))] text-[10px] font-bold text-[var(--color-button-text)]">
              {activeFilterCount}
            </span>
          )}
        </h3>
        {hasActiveFilters && (
          <button
            onClick={handleClearAll}
            className="text-xs text-[rgb(var(--color-primary-rgb))] hover:underline transition-colors"
          >
            Сбросить все
          </button>
        )}
      </div>

      {/* Collection filter */}
      {collections.length > 0 && (
        <FilterGroup title="Коллекция" defaultOpen={true}>
          <div className="space-y-2">
            {/* "All" option */}
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name="collection"
                checked={!activeCollectionId}
                onChange={() => handleCollectionChange(undefined)}
                className="h-4 w-4 accent-[rgb(var(--color-primary-rgb))]"
              />
              <span
                className={cn(
                  'text-sm transition-colors',
                  !activeCollectionId
                    ? 'text-[var(--color-text)] font-medium'
                    : 'text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]',
                )}
              >
                Все коллекции
              </span>
            </label>
            {collections.map((collection) => (
              <label
                key={collection.id}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <input
                  type="radio"
                  name="collection"
                  checked={activeCollectionId === collection.id}
                  onChange={() => handleCollectionChange(collection.id)}
                  className="h-4 w-4 accent-[rgb(var(--color-primary-rgb))]"
                />
                <span
                  className={cn(
                    'text-sm transition-colors',
                    activeCollectionId === collection.id
                      ? 'text-[var(--color-text)] font-medium'
                      : 'text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]',
                  )}
                >
                  {collection.title}
                </span>
                {collection.productCount !== undefined && (
                  <span className="text-xs text-[var(--color-text-muted)] ml-auto">
                    {collection.productCount}
                  </span>
                )}
              </label>
            ))}
          </div>
        </FilterGroup>
      )}

      {/* Price range filter */}
      <FilterGroup title="Цена" defaultOpen={true}>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="От"
            value={activePriceMin ?? ''}
            onChange={(e) => handlePriceMinChange(e.target.value)}
            className={cn(
              inputVariants({ variant: 'default', size: 'sm' }),
              'w-full',
            )}
            min="0"
            aria-label="Минимальная цена"
          />
          <span className="text-[var(--color-text-muted)] text-sm flex-shrink-0">
            --
          </span>
          <input
            type="number"
            placeholder="До"
            value={activePriceMax ?? ''}
            onChange={(e) => handlePriceMaxChange(e.target.value)}
            className={cn(
              inputVariants({ variant: 'default', size: 'sm' }),
              'w-full',
            )}
            min="0"
            aria-label="Максимальная цена"
          />
        </div>
      </FilterGroup>

      {/* Tags filter */}
      {tags.length > 0 && (
        <FilterGroup title="Теги" defaultOpen={false}>
          <div className="space-y-2">
            {tags.map((tag) => (
              <label
                key={tag}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={activeTags.includes(tag)}
                  onChange={() => handleTagToggle(tag)}
                  className="h-4 w-4 rounded accent-[rgb(var(--color-primary-rgb))]"
                />
                <span
                  className={cn(
                    'text-sm transition-colors',
                    activeTags.includes(tag)
                      ? 'text-[var(--color-text)] font-medium'
                      : 'text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]',
                  )}
                >
                  {tag}
                </span>
              </label>
            ))}
          </div>
        </FilterGroup>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 flex-shrink-0">
        <div className="sticky top-24">{filterContent}</div>
      </aside>

      {/* Mobile trigger button */}
      <div className="lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className={cn(
            buttonVariants({ variant: 'secondary', size: 'sm' }),
            'gap-2',
          )}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          Фильтры
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-[rgb(var(--color-primary-rgb))] text-[10px] font-bold text-[var(--color-button-text)]">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Mobile bottom sheet */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30 transition-opacity duration-300"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />

          {/* Bottom sheet panel */}
          <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] bg-[var(--color-background)] rounded-t-2xl shadow-xl flex flex-col animate-slide-in-bottom">
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-[var(--color-border)] rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3 border-b border-[var(--color-border)]">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">
                Фильтры
              </h3>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                aria-label="Закрыть фильтры"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Scrollable filter content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {filterContent}
            </div>

            {/* Apply button */}
            <div className="border-t border-[var(--color-border)] px-5 py-4">
              <button
                onClick={() => setMobileOpen(false)}
                className={cn(
                  buttonVariants({ variant: 'primary', size: 'lg', fullWidth: true }),
                )}
              >
                Показать результаты
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom sheet animation */}
      <style>{`
        @keyframes slideInBottom {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-in-bottom {
          animation: slideInBottom 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
