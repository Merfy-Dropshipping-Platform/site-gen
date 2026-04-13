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
      className="group flex flex-col cursor-pointer no-underline text-inherit"
      style={{ gap: 20 }}
    >
      {/* Image — 1:1 square per Figma */}
      <div
        className="overflow-hidden w-full"
        style={{ aspectRatio: '1 / 1', borderRadius: 'var(--radius-card)', backgroundColor: '#FBFBFB' }}
      >
        {firstImage ? (
          <img
            src={firstImage.url}
            alt={firstImage.alt ?? product.title}
            loading="lazy"
            className="w-full h-full object-cover"
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
      <div className="flex flex-col font-[family-name:var(--font-body)]" style={{ gap: 4 }}>
        <h3
          className="font-normal"
          style={{ fontSize: 16, lineHeight: 1.4, color: 'rgb(var(--color-foreground))', margin: 0 }}
        >
          {product.title}
        </h3>
        <div className="flex items-center" style={{ gap: 8 }}>
          <span style={{ fontSize: 16, lineHeight: 'normal', color: 'rgb(var(--color-foreground))' }}>
            {formatMoney(product.price)}
          </span>
          {product.compareAtPrice != null && product.compareAtPrice > 0 && (
            <span
              className="line-through"
              style={{ fontSize: 14, lineHeight: 'normal', color: '#444444' }}
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
