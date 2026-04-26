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

function getDiscountPercent(price: number, compareAtPrice: number): number {
  if (!compareAtPrice || compareAtPrice <= price) return 0;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

/** Extract unique color hex values from product variant options */
function getColorDots(product: Product): string[] {
  const colors: string[] = [];
  const variants = (product as any).variants ?? (product as any).variantCombinations ?? [];
  for (const v of variants) {
    const opts = v.options ?? v.optionValues ?? [];
    for (const o of opts) {
      const name = (o.groupName ?? o.name ?? '').toLowerCase();
      if (name === 'цвет' || name === 'color') {
        const hex = o.colorHex ?? o.hex ?? o.value;
        if (hex && /^#[0-9a-fA-F]{3,8}$/.test(hex) && !colors.includes(hex)) {
          colors.push(hex);
        }
      }
    }
  }
  return colors;
}

export interface ProductCardProps {
  product: Product;
  href?: string;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, href }) => {
  const linkHref = href ?? `/product/${product.handle}`;
  const rawImage = (product.images as unknown as Array<string | { url?: string; alt?: string }>)?.[0];
  const firstImage = typeof rawImage === 'string'
    ? { url: rawImage, alt: undefined as string | undefined }
    : rawImage;
  const discountPercent = product.compareAtPrice
    ? getDiscountPercent(product.price, product.compareAtPrice)
    : 0;
  const colorDots = getColorDots(product);

  return (
    <a
      href={linkHref}
      className="group flex flex-col cursor-pointer no-underline text-inherit"
      style={{ gap: 12 }}
    >
      {/* Image container — 1:1 square */}
      <div
        className="relative overflow-hidden w-full"
        style={{ aspectRatio: '1 / 1', backgroundColor: 'rgb(var(--color-background))' }}
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

        {/* Discount badge — top-left */}
        {discountPercent > 0 && (
          <span
            className="absolute font-[family-name:var(--font-body)]"
            style={{
              top: 8,
              left: 8,
              height: 24,
              padding: '0 8px',
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgb(var(--color-foreground))',
              color: 'rgb(var(--color-background))',
              fontSize: 12,
              lineHeight: '24px',
              whiteSpace: 'nowrap',
            }}
          >
            -{discountPercent}%
          </span>
        )}

        {/* Color dots — bottom-right */}
        {colorDots.length > 0 && (
          <div
            className="absolute flex"
            style={{ bottom: 8, right: 8, gap: 4 }}
          >
            {colorDots.map((hex) => (
              <span
                key={hex}
                style={{
                  width: 8,
                  height: 8,
                  backgroundColor: hex,
                  display: 'block',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Product info */}
      <div className="flex flex-col" style={{ gap: 4 }}>
        <h3
          className="font-normal line-clamp-2 uppercase"
          style={{
            fontSize: 16,
            lineHeight: 1.26,
            color: 'rgb(var(--color-foreground))',
            margin: 0,
            fontFamily: 'var(--font-body)',
          }}
        >
          {product.title}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="font-normal"
            style={{
              fontSize: 16,
              lineHeight: 1.26,
              color: 'rgb(var(--color-foreground))',
              fontFamily: 'var(--font-body)',
            }}
          >
            {formatMoney(product.price)}
          </span>
          {product.compareAtPrice != null && product.compareAtPrice > 0 && (
            <span
              className="font-normal line-through"
              style={{
                fontSize: 14,
                lineHeight: 1.26,
                color: 'rgb(var(--color-muted))',
                fontFamily: 'var(--font-body)',
              }}
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
