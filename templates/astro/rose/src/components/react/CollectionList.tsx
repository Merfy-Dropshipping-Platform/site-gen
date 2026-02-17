import React from 'react';
import type { Collection } from '../../../../../../packages/storefront/types';

export interface CollectionListProps {
  /** List of collections to display */
  collections: Collection[];
  /** Section title (optional) */
  title?: string;
  /** Section subtitle (optional) */
  subtitle?: string;
  /** Number of grid columns on desktop (default: 3) */
  columns?: number;
}

/**
 * CollectionList -- static React component for the editor.
 *
 * Renders a grid of collection cards, each showing:
 * - Collection image (with hover zoom effect)
 * - Collection title
 * - Responsive: 1 col mobile, 2 col tablet, N col desktop
 */
export const CollectionList: React.FC<CollectionListProps> = ({
  collections,
  title,
  subtitle,
  columns = 3,
}) => {
  return (
    <section className="w-full py-10 sm:py-14 md:py-20">
      {/* Section header */}
      {(title || subtitle) && (
        <div className="flex flex-col items-center gap-1 mb-8 sm:mb-10 md:mb-14">
          {title && (
            <h2 className="text-xl sm:text-2xl md:text-3xl font-normal text-black uppercase leading-tight text-center font-[family-name:var(--font-display)]">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="text-sm sm:text-base md:text-lg text-gray-400 leading-relaxed text-center px-4 font-[family-name:var(--font-body)] mt-2">
              {subtitle}
            </p>
          )}
        </div>
      )}

      {/* Collections grid */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 md:gap-10"
        style={
          {
            '--cols': columns,
          } as React.CSSProperties
        }
      >
        <style>{`
          @media (min-width: 1024px) {
            [style*="--cols"] {
              grid-template-columns: repeat(var(--cols), minmax(0, 1fr)) !important;
            }
          }
        `}</style>
        {collections.map((collection) => (
          <a
            key={collection.id}
            href={`/collections/${collection.handle}`}
            className="group cursor-pointer no-underline text-inherit"
          >
            {/* Collection image */}
            <div className="relative w-full aspect-[430/500] bg-gray-100 rounded-xl sm:rounded-2xl overflow-hidden mb-4 sm:mb-5 md:mb-6 shadow-sm hover:shadow-lg transition-shadow duration-300">
              {collection.image?.url ? (
                <img
                  src={collection.image.url}
                  alt={collection.image.alt ?? collection.title}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21,15 16,10 5,21" />
                  </svg>
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300" />
            </div>

            {/* Collection title */}
            <div className="px-1 sm:px-2">
              <h3 className="text-lg sm:text-xl md:text-2xl font-normal text-black group-hover:text-gray-700 transition-colors duration-200 font-[family-name:var(--font-body)]">
                {collection.title}
              </h3>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
};

export default CollectionList;
