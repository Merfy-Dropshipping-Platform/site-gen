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
  const hasDiscount =
    product.compareAtPrice != null && product.compareAtPrice > product.price;

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Image — 429:564 portrait per Figma 897:11521.
          Image is clipped via inner div (overflow-hidden); badge and ❤
          are siblings on the link itself so they aren't clipped. */}
      <a
        href={linkHref}
        className="relative block w-full no-underline group"
        style={{ borderRadius: 'var(--radius-card, 0px)' }}
      >
        <div
          className="relative w-full overflow-hidden"
          style={{
            aspectRatio: '429 / 564',
            backgroundColor: 'rgb(var(--color-background))',
            borderRadius: 'var(--radius-card, 0px)',
          }}
        >
          {firstImage ? (
            <img
              src={firstImage.url}
              alt={firstImage.alt ?? product.title}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ color: 'rgb(var(--color-muted))' }}
            >
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21,15 16,10 5,21" />
              </svg>
            </div>
          )}
        </div>

        {hasDiscount && (
          <span
            className="absolute top-0 left-0 flex items-center justify-center font-[family-name:var(--font-body)] uppercase"
            style={{
              height: 24,
              padding: '0 6px',
              fontSize: 12,
              fontWeight: 500,
              backgroundColor: 'rgb(var(--color-foreground))',
              color: 'rgb(var(--color-background))',
            }}
          >
            Скидка
          </span>
        )}

        <button
          type="button"
          aria-label="Добавить в избранное"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="absolute flex items-center justify-center hover:opacity-70 transition-opacity"
          style={{
            top: 12,
            right: 12,
            width: 32,
            height: 32,
            backgroundColor: 'transparent',
            color: 'rgb(var(--color-foreground))',
          }}
        >
          <svg
            width="22"
            height="20"
            viewBox="0 0 22 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 18.35l-1.45-1.32C4.4 12.36 1 9.28 1 5.5 1 2.42 3.42 0 6.5 0c1.74 0 3.41.81 4.5 2.09C12.09.81 13.76 0 15.5 0 18.58 0 21 2.42 21 5.5c0 3.78-3.4 6.86-8.55 11.54L11 18.35z" />
          </svg>
        </button>
      </a>

      <a
        href={linkHref}
        className="flex flex-col no-underline"
        style={{ gap: 4, color: 'rgb(var(--color-foreground))' }}
      >
        <h3
          className="font-[family-name:var(--font-heading)] uppercase line-clamp-2"
          style={{
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 1.2,
            margin: 0,
            color: 'rgb(var(--color-foreground))',
          }}
        >
          {product.title}
        </h3>
        <div className="flex items-center" style={{ gap: 8 }}>
          <span
            className="font-[family-name:var(--font-body)]"
            style={{ fontSize: 16, lineHeight: 1.2, color: 'rgb(var(--color-foreground))' }}
          >
            {formatMoney(product.price)}
          </span>
          {hasDiscount && (
            <span
              className="font-[family-name:var(--font-body)] line-through"
              style={{ fontSize: 14, lineHeight: 1.2, color: 'rgb(var(--color-muted))' }}
            >
              {formatMoney(product.compareAtPrice!)}
            </span>
          )}
        </div>
      </a>

      <a
        href={linkHref}
        className="flex items-center justify-center font-[family-name:var(--font-body)] uppercase no-underline transition-opacity hover:opacity-90"
        style={{
          height: 48,
          padding: '10px 16px',
          fontSize: 16,
          fontWeight: 500,
          backgroundColor: 'rgb(var(--color-foreground))',
          color: 'rgb(var(--color-background))',
          borderRadius: 'var(--radius-button, 0px)',
        }}
      >
        В корзину
      </a>
    </div>
  );
};

export default ProductCard;
