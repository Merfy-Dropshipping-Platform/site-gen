import { useState, useCallback } from 'react';
import { cn } from '../../../../packages/ui/lib/cn';
import { buttonVariants } from '../../../../packages/ui/variants/button';
import { formatMoney } from '../../../../packages/ui/lib/format';
import { useCart } from '../../../../packages/storefront/hooks/useCart';
import { useAvailability } from '../../../../packages/storefront/hooks/useAvailability';
import type { Variant } from '../../../../packages/storefront/types';

export interface AddToCartButtonProps {
  /** Product ID */
  productId: string;
  /** Product handle/slug for navigation */
  productHandle: string;
  /** Product title */
  title: string;
  /** Product price (in minor units, e.g. kopecks) */
  price: number;
  /** Product image URL */
  image: string;
  /** Available variants (optional -- if provided, shows variant selector) */
  variants?: Variant[];
  /** Pre-selected variant ID (optional) */
  defaultVariantId?: string;
}

/**
 * AddToCartButton React Island.
 * Adds products to the shared Nano Stores cart.
 * Hydrated with client:load for instant interactivity.
 *
 * Nano Stores sync: calls addItem() which updates $cartItems.
 * CartWidget reads $cartItems via useStore() and sees the update instantly.
 *
 * Features:
 * - Real-time availability check via useAvailability()
 * - Optional inline variant selector
 * - Quantity selector (+/-)
 * - Success animation/feedback on add
 */
export default function AddToCartButton({
  productId,
  productHandle,
  title,
  price,
  image,
  variants,
  defaultVariantId,
}: AddToCartButtonProps) {
  const { addItem } = useCart();
  const hasVariants = variants && variants.length > 1;

  // Selected variant state
  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    defaultVariantId ?? variants?.[0]?.id ?? productId,
  );

  // Quantity state
  const [quantity, setQuantity] = useState(1);

  // Success feedback state
  const [showSuccess, setShowSuccess] = useState(false);

  // Get the currently selected variant
  const selectedVariant = variants?.find((v) => v.id === selectedVariantId);
  const activePrice = selectedVariant?.price ?? price;
  const activeTitle = selectedVariant
    ? `${title} - ${selectedVariant.title}`
    : title;
  const activeImage = selectedVariant?.image?.url ?? image;

  // Real-time availability check
  const { data: availability, isLoading: isCheckingAvailability } =
    useAvailability(selectedVariantId);

  const isAvailable = availability?.available ?? true;
  const stockQuantity = availability?.quantity ?? Infinity;

  const handleAddToCart = useCallback(() => {
    if (!isAvailable) return;

    for (let i = 0; i < quantity; i++) {
      addItem({
        variantId: selectedVariantId,
        title: activeTitle,
        price: activePrice,
        image: activeImage,
        productId,
        productHandle,
        variantTitle: selectedVariant?.title,
      });
    }

    // Show success feedback
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);

    // Reset quantity after adding
    setQuantity(1);
  }, [
    isAvailable,
    quantity,
    addItem,
    selectedVariantId,
    activeTitle,
    activePrice,
    activeImage,
    productId,
    productHandle,
    selectedVariant,
  ]);

  const handleQuantityChange = useCallback(
    (delta: number) => {
      setQuantity((prev) => {
        const next = prev + delta;
        if (next < 1) return 1;
        if (stockQuantity !== Infinity && next > stockQuantity) return stockQuantity;
        return next;
      });
    },
    [stockQuantity],
  );

  return (
    <div className="space-y-3">
      {/* Variant selector (if multiple variants exist) */}
      {hasVariants && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-[var(--color-text)]">
            Вариант
          </label>
          <div className="flex flex-wrap gap-2">
            {variants!.map((variant) => (
              <button
                key={variant.id}
                onClick={() => {
                  setSelectedVariantId(variant.id);
                  setQuantity(1);
                }}
                disabled={!variant.available}
                className={cn(
                  'px-3 py-1.5 text-sm rounded-[var(--radius-base)] border transition-all duration-200',
                  selectedVariantId === variant.id
                    ? 'border-[rgb(var(--color-primary-rgb))] bg-[rgb(var(--color-primary-rgb)/0.1)] text-[rgb(var(--color-primary-rgb))] font-medium'
                    : 'border-[var(--color-border)] text-[var(--color-text)] hover:border-[rgb(var(--color-primary-rgb)/0.5)]',
                  !variant.available &&
                    'opacity-40 cursor-not-allowed line-through',
                )}
              >
                {variant.title}
                {variant.price !== price && (
                  <span className="ml-1 text-xs">
                    ({formatMoney(variant.price)})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quantity selector + Add to cart button */}
      <div className="flex items-center gap-3">
        {/* Quantity controls */}
        <div className="flex items-center border border-[var(--color-border)] rounded-[var(--radius-base)]">
          <button
            className="h-10 w-10 flex items-center justify-center text-[var(--color-text)] hover:bg-[rgb(var(--color-primary-rgb)/0.05)] transition-colors text-lg disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => handleQuantityChange(-1)}
            disabled={quantity <= 1 || !isAvailable}
            aria-label="Уменьшить количество"
          >
            -
          </button>
          <span className="w-10 text-center text-sm font-medium text-[var(--color-text)]">
            {quantity}
          </span>
          <button
            className="h-10 w-10 flex items-center justify-center text-[var(--color-text)] hover:bg-[rgb(var(--color-primary-rgb)/0.05)] transition-colors text-lg disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => handleQuantityChange(1)}
            disabled={
              !isAvailable ||
              (stockQuantity !== Infinity && quantity >= stockQuantity)
            }
            aria-label="Увеличить количество"
          >
            +
          </button>
        </div>

        {/* Add to cart button */}
        <button
          onClick={handleAddToCart}
          disabled={!isAvailable || isCheckingAvailability}
          className={cn(
            buttonVariants({ variant: 'primary', size: 'lg' }),
            'flex-1 relative overflow-hidden transition-all duration-300',
            showSuccess && 'bg-emerald-600 hover:bg-emerald-600',
            !isAvailable && 'opacity-60 cursor-not-allowed',
          )}
        >
          {isCheckingAvailability ? (
            <span className="flex items-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Проверка...
            </span>
          ) : showSuccess ? (
            <span className="flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Добавлено
            </span>
          ) : !isAvailable ? (
            'Нет в наличии'
          ) : (
            <span className="flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"
                />
              </svg>
              В корзину
            </span>
          )}
        </button>
      </div>

      {/* Stock warning */}
      {isAvailable && stockQuantity !== Infinity && stockQuantity <= 5 && (
        <p className="text-xs text-amber-600">
          Осталось {stockQuantity} шт.
        </p>
      )}
    </div>
  );
}
