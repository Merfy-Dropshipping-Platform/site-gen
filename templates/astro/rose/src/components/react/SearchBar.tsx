import { useEffect, useRef, useCallback } from 'react';
import { cn } from '../../../../packages/ui/lib/cn';
import { formatMoney } from '../../../../packages/ui/lib/format';
import { useSearch } from '../../../../packages/storefront/hooks/useSearch';

/**
 * SearchBar React Island.
 * Debounced product search with dropdown results overlay.
 * Hydrated with client:idle (non-critical at first load).
 *
 * Uses useSearch() hook: debounced API calls, TanStack Query caching.
 * Minimum 2 characters, 300ms debounce, max 6 results.
 */
export default function SearchBar() {
  const {
    query,
    setQuery,
    results,
    isOpen,
    setIsOpen,
    isLoading,
    hasResults,
  } = useSearch({ debounce: 300, limit: 6, minLength: 2 });

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on Escape key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    },
    [setIsOpen],
  );

  // Close dropdown on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, setIsOpen]);

  const showDropdown = isOpen && query.length >= 2;

  return (
    <div className="relative" ref={containerRef}>
      {/* Search input */}
      <div className="relative">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          ref={inputRef}
          className={cn(
            'h-9 w-48 rounded-[var(--radius-input)] border border-[var(--color-border)]',
            'bg-[var(--color-background)] pl-9 pr-3 text-sm text-[var(--color-text)]',
            'placeholder:text-[var(--color-text-muted)]',
            'focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-primary-rgb)/0.2)] focus:border-[rgb(var(--color-primary-rgb))]',
            'transition-all duration-300',
            isOpen && 'w-64',
          )}
          type="text"
          placeholder="Поиск товаров..."
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Поиск товаров"
          aria-expanded={showDropdown}
          role="combobox"
          aria-haspopup="listbox"
          autoComplete="off"
        />
        {/* Loading spinner */}
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg
              className="h-4 w-4 animate-spin text-[var(--color-text-muted)]"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Search results dropdown */}
      {showDropdown && (
        <div
          className="absolute top-full right-0 mt-2 w-80 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-background)] shadow-lg overflow-hidden z-50"
          role="listbox"
        >
          {isLoading && !hasResults ? (
            <div className="px-4 py-6 text-center">
              <svg
                className="h-5 w-5 animate-spin text-[var(--color-text-muted)] mx-auto mb-2"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <p className="text-sm text-[var(--color-text-muted)]">Поиск...</p>
            </div>
          ) : hasResults ? (
            results.map((product) => (
              <a
                key={product.id}
                href={`/products/${product.handle}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[rgb(var(--color-primary-rgb)/0.05)] transition-colors"
                role="option"
                onClick={() => setIsOpen(false)}
              >
                {product.images[0]?.url ? (
                  <img
                    src={product.images[0].url}
                    alt={product.title}
                    className="h-10 w-10 rounded-[var(--radius-base)] object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-[var(--radius-base)] bg-[var(--color-border)] flex items-center justify-center flex-shrink-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-[var(--color-text-muted)]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text)] truncate">
                    {product.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm font-semibold text-[var(--color-text)]">
                      {formatMoney(product.price)}
                    </span>
                    {product.compareAtPrice && product.compareAtPrice > product.price && (
                      <span className="text-xs text-[var(--color-text-muted)] line-through">
                        {formatMoney(product.compareAtPrice)}
                      </span>
                    )}
                  </div>
                </div>
              </a>
            ))
          ) : (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">
                Ничего не найдено
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Попробуйте изменить запрос
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
