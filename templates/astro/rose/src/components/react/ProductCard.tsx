import React from 'react';
import type { Product } from '../../../../../../packages/storefront/types';

/**
 * Format price from kopecks to a human-readable currency string.
 * @param kopecks - Price in smallest currency unit (kopecks for RUB)
 * @param currency - ISO 4217 currency code (default: RUB)
 */
export function formatMoney(kopecks: number, currency = 'RUB'): string {
  const amount = kopecks / 100;
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export interface ProductCardProps {
  product: Product;
  /** Override the link href (default: /product/{handle}) */
  href?: string;
}

/**
 * ProductCard -- React version for the editor (constructor).
 *
 * Displays a product card with:
 * - Square product image with hover zoom effect
 * - Product title
 * - Current price (formatted from kopecks)
 * - Old price with strikethrough (if compareAtPrice is set)
 * - Link to product detail page
 */
export const ProductCard: React.FC<ProductCardProps> = ({ product, href }) => {
  const linkHref = href ?? `/product/${product.handle}`;
  const firstImage = product.images?.[0];

  return (
    <a
      href={linkHref}
      className="group flex flex-col gap-4 sm:gap-5 md:gap-6 cursor-pointer no-underline text-inherit"
    >
      {/* Image container */}
      <div className="bg-gray-100 rounded-lg overflow-hidden w-full aspect-square">
        {firstImage ? (
          <img
            src={firstImage.url}
            alt={firstImage.alt ?? product.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
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
      </div>

      {/* Product info */}
      <div className="flex flex-col gap-2 px-1">
        <h3 className="text-base sm:text-lg md:text-xl font-normal text-black leading-snug font-[family-name:var(--font-body)]">
          {product.title}
        </h3>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-lg sm:text-xl md:text-2xl font-normal text-black leading-snug font-[family-name:var(--font-body)]">
            {formatMoney(product.price)}
          </span>
          {product.compareAtPrice != null && product.compareAtPrice > 0 && (
            <span className="text-sm sm:text-base md:text-lg font-medium text-gray-400 line-through leading-snug font-[family-name:var(--font-body)]">
              {formatMoney(product.compareAtPrice)}
            </span>
          )}
        </div>
      </div>
    </a>
  );
};

export default ProductCard;
