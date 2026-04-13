import React from 'react';
import type { Product } from '../../lib/storefront/types';

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
  href?: string;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, href }) => {
  const linkHref = href ?? `/product/${product.handle}`;
  const firstImage = product.images?.[0];

  return (
    <a
      href={linkHref}
      className="group flex flex-col cursor-pointer no-underline text-inherit gap-4 sm:gap-5 md:gap-6 lg:gap-[25px]"
    >
      {/* Image — portrait 318:515 per reference repo */}
      <div
        className="overflow-hidden w-full bg-gray-100 rounded-lg sm:rounded-[8px] md:rounded-[10px]"
        style={{ aspectRatio: '318 / 515' }}
      >
        {firstImage ? (
          <img
            src={firstImage.url}
            alt={firstImage.alt ?? product.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ color: 'rgb(var(--color-muted))' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21,15 16,10 5,21" />
            </svg>
          </div>
        )}
      </div>

      {/* Product info */}
      <div className="flex flex-col gap-2 sm:gap-2.5 md:gap-3 lg:gap-[10px] px-2 sm:px-3 md:px-4 lg:px-[15px]">
        <h3
          className="text-base sm:text-lg md:text-xl lg:text-[24px] font-normal leading-[1.366]"
          style={{ color: 'rgb(var(--color-foreground))', margin: 0, fontFamily: "var(--font-body)" }}
        >
          {product.title}
        </h3>
        <div className="flex items-center gap-2 sm:gap-3 md:gap-4 lg:gap-[15px] flex-wrap">
          <span
            className="text-lg sm:text-xl md:text-2xl lg:text-[32px] font-normal leading-[1.366]"
            style={{ color: 'rgb(var(--color-foreground))', fontFamily: "var(--font-body)" }}
          >
            {formatMoney(product.price)}
          </span>
          {product.compareAtPrice != null && product.compareAtPrice > 0 && (
            <span
              className="text-sm sm:text-base md:text-lg lg:text-[20px] font-medium line-through leading-[1.366]"
              style={{ color: 'rgb(var(--color-muted))', fontFamily: "var(--font-body)" }}
            >
              {formatMoney(product.compareAtPrice)}
            </span>
          )}
        </div>
      </div>
    </a>
  );
};

export default ProductCard;
