import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { cn } from '../../../../packages/ui/lib/cn';
import { buttonVariants } from '../../../../packages/ui/variants/button';
import { formatMoney } from '../../../../packages/ui/lib/format';
import { useCart } from '../../../../packages/storefront/hooks/useCart';
import { $cartCount } from '../../../../packages/storefront/stores/cart';

/**
 * CartWidget React Island.
 * Renders a cart icon with badge count and a slide-out drawer sidebar.
 * Hydrated with client:load for instant interactivity.
 *
 * Nano Stores sync: reads $cartCount for badge, useCart() for items/total.
 * When AddToCartButton calls addToCart(), this widget updates instantly.
 */
export default function CartWidget() {
  const { items, total, count, removeItem, updateQuantity } = useCart();
  const badgeCount = useStore($cartCount);
  const [open, setOpen] = useState(false);

  // Close drawer on Escape key
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const handleQuantityChange = useCallback(
    (variantId: string, currentQty: number, delta: number) => {
      const newQty = currentQty + delta;
      if (newQty <= 0) {
        removeItem(variantId);
      } else {
        updateQuantity(variantId, newQty);
      }
    },
    [removeItem, updateQuantity],
  );

  return (
    <>
      {/* Cart icon button with badge */}
      <button
        className="relative p-2 text-[var(--color-text)] hover:text-[rgb(var(--color-primary-rgb))] transition-colors"
        onClick={() => setOpen(true)}
        aria-label={`Корзина (${badgeCount})`}
      >
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
        {badgeCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[rgb(var(--color-primary-rgb))] text-[10px] font-bold text-[var(--color-button-text)]">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>

      {/* Drawer overlay + sidebar */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30 transition-opacity duration-300"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Sidebar panel */}
          <div className="relative w-full max-w-md bg-[var(--color-background)] shadow-xl flex flex-col animate-slide-in-right">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
              <h2 className="text-lg font-[family-name:var(--font-heading)] font-semibold text-[var(--color-text)]">
                Корзина ({count})
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                aria-label="Закрыть корзину"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Cart items */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-16 w-16 text-[var(--color-text-muted)] opacity-40 mb-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"
                    />
                  </svg>
                  <p className="text-[var(--color-text-muted)] text-sm">
                    Корзина пуста
                  </p>
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.variantId}
                    className="flex gap-3 pb-4 border-b border-[var(--color-border)] last:border-b-0"
                  >
                    {/* Product image */}
                    <img
                      src={item.image}
                      alt={item.title}
                      className="h-16 w-16 rounded-[var(--radius-base)] object-cover flex-shrink-0"
                    />

                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text)] truncate">
                        {item.title}
                      </p>
                      {item.variantTitle && (
                        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                          {item.variantTitle}
                        </p>
                      )}
                      <p className="text-sm font-semibold text-[var(--color-text)] mt-1">
                        {formatMoney(item.price)}
                      </p>

                      {/* Quantity controls */}
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          className="h-7 w-7 flex items-center justify-center rounded-[var(--radius-base)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[rgb(var(--color-primary-rgb)/0.05)] transition-colors text-sm"
                          onClick={() => handleQuantityChange(item.variantId, item.quantity, -1)}
                          aria-label="Уменьшить количество"
                        >
                          -
                        </button>
                        <span className="text-sm font-medium text-[var(--color-text)] w-6 text-center">
                          {item.quantity}
                        </span>
                        <button
                          className="h-7 w-7 flex items-center justify-center rounded-[var(--radius-base)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[rgb(var(--color-primary-rgb)/0.05)] transition-colors text-sm"
                          onClick={() => handleQuantityChange(item.variantId, item.quantity, 1)}
                          aria-label="Увеличить количество"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={() => removeItem(item.variantId)}
                      className="self-start p-1 text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
                      aria-label={`Удалить ${item.title}`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Footer: subtotal + checkout */}
            {items.length > 0 && (
              <div className="border-t border-[var(--color-border)] px-5 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--color-text-muted)]">Итого</span>
                  <span className="text-lg font-semibold text-[var(--color-text)]">
                    {formatMoney(total)}
                  </span>
                </div>
                <a
                  href="/checkout"
                  className={cn(
                    buttonVariants({ variant: 'primary', size: 'lg', fullWidth: true }),
                  )}
                >
                  Оформить заказ
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slide-in animation */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
