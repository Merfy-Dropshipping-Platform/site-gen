import React, { useState, useCallback } from 'react';
import { useCart } from '../../../../../../packages/storefront/hooks/useCart';
import type { Product, Variant } from '../../../../../../packages/storefront/types';
import { formatMoney } from './ProductCard';

export interface ProductDetailProps {
  product: Product;
}

/**
 * ProductDetail -- React Island (client:load).
 *
 * Full product page component with:
 * - Image gallery: main image + thumbnail selector
 * - Variant selector (size, color, etc.)
 * - Quantity selector with +/- controls
 * - Add to Cart button (uses useCart().addItem)
 * - Buy Now button
 * - Price display with old-price strikethrough
 * - Product description
 */
export const ProductDetail: React.FC<ProductDetailProps> = ({ product }) => {
  const { addItem } = useCart();

  // Image gallery state
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // Variant selection
  const availableVariants = product.variants.filter((v) => v.available);
  const [selectedVariant, setSelectedVariant] = useState<Variant>(
    availableVariants[0] ?? product.variants[0],
  );

  // Quantity
  const [quantity, setQuantity] = useState(1);

  const currentImage = product.images?.[selectedImageIndex];
  const currentPrice = selectedVariant?.price ?? product.price;
  const currentCompareAtPrice =
    selectedVariant?.compareAtPrice ?? product.compareAtPrice;

  const handleAddToCart = useCallback(() => {
    if (!selectedVariant) return;
    addItem({
      variantId: selectedVariant.id,
      title: `${product.title} - ${selectedVariant.title}`,
      price: currentPrice,
      image: currentImage?.url ?? '',
      productId: product.id,
      productHandle: product.handle,
      variantTitle: selectedVariant.title,
    });
  }, [
    addItem,
    selectedVariant,
    product,
    currentPrice,
    currentImage,
  ]);

  const handleBuyNow = useCallback(() => {
    handleAddToCart();
    // Navigate to checkout
    window.location.href = '/checkout';
  }, [handleAddToCart]);

  const incrementQuantity = useCallback(() => {
    setQuantity((q) => q + 1);
  }, []);

  const decrementQuantity = useCallback(() => {
    setQuantity((q) => (q > 1 ? q - 1 : 1));
  }, []);

  return (
    <section className="max-w-[1320px] mx-auto px-4 sm:px-6 py-[75px]">
      <div className="flex flex-col lg:flex-row gap-[40px] items-start">
        {/* Left: Product info */}
        <div className="flex flex-col w-full lg:flex-1" style={{ gap: 40 }}>
          <div className="flex flex-col">
            {/* Title */}
            <h1 className="font-[family-name:var(--font-body)]" style={{ fontSize: 24, lineHeight: 1.366, color: 'rgb(var(--color-foreground))', margin: 0 }}>
              {product.title}
            </h1>

            {/* Price */}
            <div className="flex items-center gap-[8px]" style={{ marginTop: 5 }}>
              <span className="font-[family-name:var(--font-body)]" style={{ fontSize: 16, lineHeight: 1.4, color: 'rgb(var(--color-foreground))' }}>
                {formatMoney(currentPrice)}
              </span>
              {currentCompareAtPrice != null && currentCompareAtPrice > 0 && (
                <span className="font-[family-name:var(--font-body)] line-through" style={{ fontSize: 14, lineHeight: 1.4, color: 'rgb(var(--color-muted))' }}>
                  {formatMoney(currentCompareAtPrice)}
                </span>
              )}
            </div>
          </div>

          {/* Variant selector */}
          {product.variants.length > 1 && (
            <div className="flex flex-col gap-[15px]">
              <span className="font-[family-name:var(--font-body)]" style={{ fontSize: 20, lineHeight: '27px', color: 'rgb(var(--color-muted))' }}>
                Размер
              </span>
              <div className="flex flex-wrap gap-[10px]">
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    onClick={() => variant.available && setSelectedVariant(variant)}
                    disabled={!variant.available}
                    className="font-[family-name:var(--font-body)] cursor-pointer transition-colors"
                    style={{
                      height: 40,
                      padding: 10,
                      fontSize: 16,
                      lineHeight: '22px',
                      borderRadius: 'var(--radius-button)',
                      ...(selectedVariant?.id === variant.id
                        ? { background: 'rgb(var(--color-foreground))', border: '1px solid rgb(var(--color-foreground))', color: 'rgb(var(--color-background))' }
                        : !variant.available
                          ? { background: 'rgba(153,153,153,0.05)', border: '1px solid rgb(var(--color-muted))', color: 'rgb(var(--color-muted))', textDecoration: 'line-through', cursor: 'not-allowed' }
                          : { background: 'transparent', border: '1px solid rgb(var(--color-foreground))', color: 'rgb(var(--color-foreground))' }
                      ),
                    }}
                  >
                    {variant.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity selector */}
          <div className="flex flex-col gap-[15px]">
            <span className="font-[family-name:var(--font-body)]" style={{ fontSize: 20, lineHeight: '27px', color: 'rgb(var(--color-muted))' }}>
              Количество
            </span>
            <div className="flex items-center gap-[5px]">
              <button
                onClick={decrementQuantity}
                className="w-[40px] h-[40px] flex items-center justify-center cursor-pointer"
                style={{ borderRadius: 'var(--radius-button)', border: '1px solid rgb(var(--color-foreground))', background: 'rgb(var(--color-background))', color: 'rgb(var(--color-foreground))' }}
              >
                <svg width="20" height="20" viewBox="0 0 32 32" fill="none"><path d="M8 16H24" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </button>
              <div className="w-[40px] h-[40px] flex items-center justify-center" style={{ borderRadius: 'var(--radius-button)', background: 'rgb(var(--color-background))' }}>
                <span className="font-[family-name:var(--font-body)]" style={{ fontSize: 16, lineHeight: '22px', color: 'rgb(var(--color-foreground))' }}>
                  {quantity}
                </span>
              </div>
              <button
                onClick={incrementQuantity}
                className="w-[40px] h-[40px] flex items-center justify-center cursor-pointer"
                style={{ borderRadius: 'var(--radius-button)', border: '1px solid rgb(var(--color-foreground))', background: 'rgb(var(--color-background))', color: 'rgb(var(--color-foreground))' }}
              >
                <svg width="20" height="20" viewBox="0 0 32 32" fill="none"><path d="M16 8V24M8 16H24" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-[12px]">
            <button
              onClick={handleAddToCart}
              className="w-full flex items-center justify-center font-[family-name:var(--font-body)] cursor-pointer transition-colors"
              style={{
                height: 56,
                fontSize: 16,
                lineHeight: '22px',
                borderRadius: 'var(--radius-button)',
                background: 'transparent',
                border: '1px solid rgb(var(--color-foreground))',
                color: 'rgb(var(--color-foreground))',
              }}
            >
              Добавить в корзину
            </button>
            <button
              onClick={handleBuyNow}
              className="w-full flex items-center justify-center font-[family-name:var(--font-body)] cursor-pointer transition-colors"
              style={{
                height: 56,
                fontSize: 16,
                lineHeight: '22px',
                borderRadius: 'var(--radius-button)',
                background: 'rgb(var(--color-button))',
                color: 'rgb(var(--color-button-text))',
                border: 'none',
              }}
            >
              Купить сейчас
            </button>
          </div>

          {/* Description */}
          {product.description && (
            <div className="flex flex-col gap-[15px]">
              <h2 className="font-[family-name:var(--font-body)] uppercase" style={{ fontSize: 20, lineHeight: '27px', color: 'rgb(var(--color-foreground))', margin: 0 }}>
                Описание
              </h2>
              <p className="font-[family-name:var(--font-body)] whitespace-pre-line" style={{ fontSize: 16, lineHeight: '22px', color: 'rgb(var(--color-muted))', margin: 0 }}>
                {product.description}
              </p>
            </div>
          )}
        </div>

        {/* Right: Image gallery */}
        <div className="w-full lg:shrink-0 flex flex-col lg:flex-row gap-[8px]" style={{ maxWidth: 648 }}>
          {/* Main image */}
          <div className="overflow-hidden aspect-square flex items-center justify-center cursor-pointer" style={{ width: '100%', maxWidth: 552, background: 'rgb(var(--color-foreground) / 0.03)' }}>
            {currentImage ? (
              <img
                src={currentImage.url}
                alt={currentImage.alt ?? product.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ color: 'rgb(var(--color-muted))' }}>
                <svg
                  width="64"
                  height="64"
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

          {/* Thumbnails: vertical strip to the right of main image */}
          {product.images.length > 1 && (
            <div className="hidden lg:flex flex-col gap-[8px] w-[88px] shrink-0 overflow-y-auto" style={{ maxHeight: 552 }}>
              {product.images.map((image, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedImageIndex(index)}
                  className="flex-shrink-0 w-[88px] h-[88px] flex items-center justify-center cursor-pointer overflow-hidden border-2 transition-colors"
                  style={{
                    borderRadius: 'var(--radius-card)',
                    background: 'rgb(var(--color-foreground) / 0.03)',
                    borderColor: index === selectedImageIndex ? 'rgb(var(--color-foreground))' : 'transparent',
                  }}
                >
                  <img
                    src={image.url}
                    alt={image.alt ?? `${product.title} ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default ProductDetail;
