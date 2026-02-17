import React from 'react';
import { useProducts } from '../../../../../../packages/storefront/hooks/useProducts';
import type { SortOption } from '../../../../../../packages/storefront/hooks/useProducts';
import { ProductCard } from './ProductCard';

export interface ProductGridProps {
  /** Filter by collection ID */
  collectionId?: string;
  /** Number of columns on desktop (default: 4) */
  columns?: number;
  /** Products per page (default: 24) */
  limit?: number;
  /** Default sort order */
  sort?: SortOption;
  /** Section title */
  title?: string;
}

/**
 * ProductGrid -- React Island (client:load).
 *
 * Interactive product grid that:
 * - Fetches products via useProducts() from @merfy/storefront
 * - Supports filtering by collection
 * - Responsive grid: 1 col mobile, 2 col tablet, 3-4 col desktop
 * - Shows loading skeletons during fetch
 * - Shows error and empty states
 */
export const ProductGrid: React.FC<ProductGridProps> = ({
  collectionId,
  columns = 4,
  limit = 24,
  sort,
  title,
}) => {
  const {
    data: products,
    isLoading,
    isError,
    error,
    page,
    setPage,
    hasNextPage,
  } = useProducts({ collectionId, sort, limit });

  // Loading state: skeleton grid
  if (isLoading) {
    return (
      <section className="w-full">
        {title && (
          <h2 className="text-xl sm:text-2xl md:text-3xl font-normal text-black uppercase leading-tight text-center mb-8 sm:mb-12 font-[family-name:var(--font-display)]">
            {title}
          </h2>
        )}
        <div
          className="grid gap-4 sm:gap-5 md:gap-6"
          style={{
            gridTemplateColumns: `repeat(${Math.min(columns, 2)}, 1fr)`,
          }}
        >
          {Array.from({ length: limit > 8 ? 8 : limit }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-gray-200 rounded-lg aspect-square mb-4" />
              <div className="bg-gray-200 rounded h-4 w-3/4 mb-2" />
              <div className="bg-gray-200 rounded h-5 w-1/3" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Error state
  if (isError) {
    return (
      <section className="w-full py-12 text-center">
        <p className="text-gray-500 text-lg">
          Произошла ошибка при загрузке товаров
        </p>
        {error?.message && (
          <p className="text-gray-400 text-sm mt-2">{error.message}</p>
        )}
      </section>
    );
  }

  // Empty state
  if (!products || products.length === 0) {
    return (
      <section className="w-full py-12 text-center">
        {title && (
          <h2 className="text-xl sm:text-2xl md:text-3xl font-normal text-black uppercase leading-tight text-center mb-8 font-[family-name:var(--font-display)]">
            {title}
          </h2>
        )}
        <p className="text-gray-500 text-lg">Товары скоро появятся</p>
      </section>
    );
  }

  return (
    <section className="w-full">
      {title && (
        <h2 className="text-xl sm:text-2xl md:text-3xl font-normal text-black uppercase leading-tight text-center mb-8 sm:mb-12 font-[family-name:var(--font-display)]">
          {title}
        </h2>
      )}

      {/* Product grid */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 md:gap-6"
        style={
          {
            '--grid-cols': columns,
          } as React.CSSProperties
        }
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
      {hasNextPage && (
        <div className="flex justify-center mt-8 sm:mt-12">
          <button
            onClick={() => setPage(page + 1)}
            className="px-6 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:border-gray-500 hover:text-black transition-colors"
          >
            Показать ещё
          </button>
        </div>
      )}
    </section>
  );
};

export default ProductGrid;
