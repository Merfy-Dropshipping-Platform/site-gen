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
      {/* Image — 1:1 square per Figma */}
      <div
        className="overflow-hidden w-full"
        style={{ aspectRatio: '1 / 1', backgroundColor: 'rgb(var(--color-background))' }}
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

      {/* Product info — Figma: 20px gap, Arsenal 16px UPPERCASE title, 16px price */}
      <div className="flex flex-col" style={{ gap: 4, paddingTop: 20 }}>
        <h3
          className="text-[16px] font-normal leading-[1.26] line-clamp-2 uppercase"
          style={{ color: 'rgb(var(--color-foreground))', margin: 0, fontFamily: "var(--font-body)" }}
        >
          {product.title}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[16px] font-normal leading-[1.26]"
            style={{ color: 'rgb(var(--color-foreground))', fontFamily: "var(--font-body)" }}
          >
            {formatMoney(product.price)}
          </span>
          {product.compareAtPrice != null && product.compareAtPrice > 0 && (
            <span
              className="text-[14px] font-normal line-through leading-[1.26]"
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
