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

export type CardStyle = 'auto' | 'portrait' | 'square' | 'wide';

export interface ProductCardProps {
  product: Product;
  href?: string;
  cardStyle?: CardStyle;
}

const ASPECT_BY_STYLE: Record<CardStyle, string> = {
  portrait: '3 / 4',
  square: '1 / 1',
  wide: '4 / 3',
  auto: '315 / 515',
};

export const ProductCard: React.FC<ProductCardProps> = ({ product, href, cardStyle }) => {
  const linkHref = href ?? `/product/${product.handle}`;
  const rawImage = (product.images as unknown as Array<string | { url?: string; alt?: string }>)?.[0];
  const firstImage = typeof rawImage === 'string'
    ? { url: rawImage, alt: undefined as string | undefined }
    : rawImage;
  const aspectRatio = ASPECT_BY_STYLE[cardStyle ?? 'auto'];

  return (
    <a
      href={linkHref}
      className="group flex flex-col cursor-pointer no-underline text-inherit"
      style={{ gap: 25 }}
    >
      {/* Image — aspect ratio depends on cardStyle prop (default portrait 315:515 ≈ 1:1.635) */}
      <div
        className="overflow-hidden w-full"
        style={{ aspectRatio, borderRadius: 10, backgroundColor: 'rgb(var(--color-muted) / 0.1)' }}
      >
        {firstImage?.url ? (
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
      <div className="flex flex-col font-[family-name:var(--font-body)]" style={{ gap: 10, padding: '0 15px' }}>
        <h3
          className="font-normal text-lg sm:text-2xl"
          style={{ lineHeight: '1.38', color: 'rgb(var(--color-foreground))', margin: 0 }}
        >
          {product.title}
        </h3>
        <div className="flex items-center" style={{ gap: 15 }}>
          <span className="text-2xl sm:text-[32px]" style={{ lineHeight: '44px', color: 'rgb(var(--color-foreground))' }}>
            {formatMoney(product.price)}
          </span>
          {product.compareAtPrice != null && product.compareAtPrice > 0 && (
            <span
              className="line-through text-base sm:text-xl"
              style={{ lineHeight: '27px', fontWeight: 500, color: 'rgb(var(--color-muted))' }}
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
