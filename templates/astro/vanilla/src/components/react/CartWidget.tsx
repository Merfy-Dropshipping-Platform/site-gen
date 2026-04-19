import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { formatMoney } from '../../../../packages/ui/lib/format';
import { useCart } from '../../../../packages/storefront/hooks/useCart';
import { $cartCount } from '../../../../packages/storefront/stores/cart';

export default function CartWidget() {
  const { items, total, count, removeItem, updateQuantity } = useCart();
  const badgeCount = useStore($cartCount);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
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
      <button
        className="relative p-2 transition-opacity hover:opacity-80"
        style={{ color: 'rgb(var(--color-foreground))' }}
        onClick={() => setOpen(true)}
        aria-label={`Корзина (${badgeCount})`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
        </svg>
        {badgeCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center text-white font-bold"
            style={{ minWidth: 18, height: 18, fontSize: 12, backgroundColor: 'rgb(var(--color-foreground))', fontFamily: "'Exo 2', sans-serif", borderRadius: '50%' }}
          >
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30 transition-opacity duration-300"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div
            className="relative w-full max-w-md shadow-xl flex flex-col animate-slide-in-right"
            style={{ background: 'rgb(var(--color-background))', color: 'rgb(var(--color-foreground))' }}
          >
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid rgb(var(--color-foreground) / 0.15)' }}
            >
              <h2
                className="font-[family-name:var(--font-heading)] italic font-normal"
                style={{ fontSize: 20, color: 'rgb(var(--color-foreground))' }}
              >
                Корзина ({count})
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1 transition-opacity hover:opacity-60"
                style={{ color: 'rgb(var(--color-foreground))' }}
                aria-label="Закрыть корзину"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4" style={{ gap: 16 }}>
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4" style={{ color: 'rgb(var(--color-muted))', opacity: 0.4 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                  </svg>
                  <p className="font-body" style={{ fontSize: 16, color: 'rgb(var(--color-muted))' }}>
                    Корзина пуста
                  </p>
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.variantId}
                    className="flex gap-3 pb-4"
                    style={{ borderBottom: '1px solid rgb(var(--color-foreground) / 0.1)', marginBottom: 16 }}
                  >
                    <img
                      src={item.image}
                      alt={item.title}
                      className="h-16 w-16 object-cover flex-shrink-0"
                      style={{ borderRadius: 0 }}
                    />

                    <div className="flex-1 min-w-0">
                      <p className="font-body truncate" style={{ fontSize: 16, color: 'rgb(var(--color-foreground))', margin: 0 }}>
                        {item.title}
                      </p>
                      {item.variantTitle && (
                        <p className="font-body" style={{ fontSize: 14, color: 'rgb(var(--color-muted))', margin: '2px 0 0' }}>
                          {item.variantTitle}
                        </p>
                      )}
                      <p className="font-body" style={{ fontSize: 16, color: 'rgb(var(--color-foreground))', margin: '4px 0 0', fontWeight: 500 }}>
                        {formatMoney(item.price)}
                      </p>

                      <div className="flex items-center mt-2" style={{ gap: 5 }}>
                        <button
                          className="flex items-center justify-center cursor-pointer"
                          style={{
                            width: 32, height: 32, borderRadius: 0,
                            border: '1px solid rgb(var(--color-foreground))',
                            background: 'transparent', color: 'rgb(var(--color-foreground))',
                          }}
                          onClick={() => handleQuantityChange(item.variantId, item.quantity, -1)}
                          aria-label="Уменьшить количество"
                        >
                          -
                        </button>
                        <span className="font-body text-center" style={{ width: 32, fontSize: 16, color: 'rgb(var(--color-foreground))' }}>
                          {item.quantity}
                        </span>
                        <button
                          className="flex items-center justify-center cursor-pointer"
                          style={{
                            width: 32, height: 32, borderRadius: 0,
                            border: '1px solid rgb(var(--color-foreground))',
                            background: 'transparent', color: 'rgb(var(--color-foreground))',
                          }}
                          onClick={() => handleQuantityChange(item.variantId, item.quantity, 1)}
                          aria-label="Увеличить количество"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={() => removeItem(item.variantId)}
                      className="self-start p-1 transition-opacity hover:opacity-60"
                      style={{ color: 'rgb(var(--color-muted))', background: 'none', border: 'none', cursor: 'pointer' }}
                      aria-label={`Удалить ${item.title}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>

            {items.length > 0 && (
              <div className="px-5 py-4" style={{ borderTop: '1px solid rgb(var(--color-foreground) / 0.15)' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-body" style={{ fontSize: 16, color: 'rgb(var(--color-muted))' }}>Итого</span>
                  <span className="font-body" style={{ fontSize: 20, color: 'rgb(var(--color-foreground))' }}>
                    {formatMoney(total)}
                  </span>
                </div>
                <a
                  href="/checkout"
                  className="flex items-center justify-center w-full font-body uppercase no-underline transition-opacity hover:opacity-90"
                  style={{
                    height: 56, fontSize: 16, borderRadius: 0,
                    background: 'rgb(var(--color-button))', color: 'rgb(var(--color-button-text))',
                  }}
                >
                  Оформить заказ
                </a>
              </div>
            )}
          </div>
        </div>
      )}

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
