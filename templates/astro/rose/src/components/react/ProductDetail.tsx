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
    <section className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 lg:gap-16 items-start">
        {/* Left: Image gallery */}
        <div className="flex flex-col gap-4">
          {/* Main image */}
          <div className="relative bg-gray-50 rounded-2xl overflow-hidden aspect-square">
            {currentImage ? (
              <img
                src={currentImage.url}
                alt={currentImage.alt ?? product.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300">
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

          {/* Thumbnails */}
          {product.images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {product.images.map((image, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedImageIndex(index)}
                  className={`flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border-2 transition-colors ${
                    index === selectedImageIndex
                      ? 'border-black'
                      : 'border-transparent hover:border-gray-300'
                  }`}
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

        {/* Right: Product info */}
        <div className="flex flex-col gap-6">
          {/* Title */}
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-medium text-gray-900 leading-tight font-[family-name:var(--font-display)]">
            {product.title}
          </h1>

          {/* Price */}
          <div className="flex items-center gap-3">
            <span className="text-xl sm:text-2xl font-semibold text-[var(--rose-600,#e11d48)]">
              {formatMoney(currentPrice)}
            </span>
            {currentCompareAtPrice != null && currentCompareAtPrice > 0 && (
              <span className="text-base sm:text-lg text-gray-400 line-through">
                {formatMoney(currentCompareAtPrice)}
              </span>
            )}
          </div>

          {/* Variant selector */}
          {product.variants.length > 1 && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-600">
                Размер
              </span>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    onClick={() => variant.available && setSelectedVariant(variant)}
                    disabled={!variant.available}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      selectedVariant?.id === variant.id
                        ? 'border-black bg-black text-white'
                        : variant.available
                          ? 'border-gray-300 bg-white text-gray-800 hover:border-gray-500'
                          : 'border-gray-200 bg-gray-50 text-gray-300 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    {variant.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity selector */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-gray-600">
              Количество
            </span>
            <div className="flex items-center gap-0 w-fit border border-gray-300 rounded-lg overflow-hidden">
              <button
                onClick={decrementQuantity}
                className="w-10 h-10 flex items-center justify-center text-lg font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                -
              </button>
              <span className="w-12 h-10 flex items-center justify-center text-base font-medium border-x border-gray-300">
                {quantity}
              </span>
              <button
                onClick={incrementQuantity}
                className="w-10 h-10 flex items-center justify-center text-lg font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            <button
              onClick={handleAddToCart}
              className="flex-1 px-6 py-3.5 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-800 hover:border-[var(--rose-600,#e11d48)] hover:text-[var(--rose-600,#e11d48)] transition-all"
            >
              Добавить в корзину
            </button>
            <button
              onClick={handleBuyNow}
              className="flex-1 px-6 py-3.5 text-sm font-medium rounded-lg border-none bg-[var(--rose-600,#e11d48)] text-white hover:bg-[var(--rose-700,#be123c)] transition-all"
            >
              Купить сейчас
            </button>
          </div>

          {/* Description */}
          {product.description && (
            <div className="mt-4 pt-6 border-t border-gray-200">
              <p className="text-base text-gray-600 leading-relaxed font-[family-name:var(--font-body)]">
                {product.description}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default ProductDetail;
