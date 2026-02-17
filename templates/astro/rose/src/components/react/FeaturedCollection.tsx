import React from 'react';
import type { Collection, Product } from '../../../../../../packages/storefront/types';
import { ProductCard } from './ProductCard';

export interface FeaturedCollectionProps {
  /** The collection to feature */
  collection: Collection;
  /** Products belonging to this collection */
  products: Product[];
  /** Number of columns on desktop (default: 4) */
  columns?: number;
}

/**
 * FeaturedCollection -- static React component for the editor.
 *
 * Renders a section with:
 * - Collection title
 * - Collection description (optional)
 * - Grid of product cards from that collection
 * - Responsive layout matching ProductGrid
 */
export const FeaturedCollection: React.FC<FeaturedCollectionProps> = ({
  collection,
  products,
  columns = 4,
}) => {
  return (
    <section className="w-full py-10 sm:py-14 md:py-20">
      {/* Section header */}
      <div className="flex flex-col items-center gap-1 mb-8 sm:mb-10 md:mb-14">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-normal text-black uppercase leading-tight text-center font-[family-name:var(--font-display)]">
          {collection.title}
        </h2>
        {collection.description && (
          <p className="text-sm sm:text-base md:text-lg text-gray-400 leading-relaxed text-center px-4 font-[family-name:var(--font-body)] mt-2">
            {collection.description}
          </p>
        )}
      </div>

      {/* Products grid */}
      {products.length === 0 ? (
        <p className="text-center text-gray-500 text-lg py-8">
          Товары скоро появятся
        </p>
      ) : (
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
      )}

      {/* View all link */}
      {collection.handle && products.length > 0 && (
        <div className="flex justify-center mt-8">
          <a
            href={`/collections/${collection.handle}`}
            className="px-6 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:border-gray-500 hover:text-black transition-colors no-underline"
          >
            Смотреть все
          </a>
        </div>
      )}
    </section>
  );
};

export default FeaturedCollection;
