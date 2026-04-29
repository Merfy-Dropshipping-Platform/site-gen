import { useEffect, useState } from 'react';
import { useCart } from '../hooks/useCart';
import { CartItemRow, type CartItemRowData } from './CartItemRow';

const formatPrice = (cents: number): string => {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
  }).format(cents / 100);
};

export function CartDrawerIsland() {
  const cart = useCart();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleToggle = (): void => setOpen((p) => !p);
    const handleClose = (): void => setOpen(false);
    window.addEventListener('cart-drawer:toggle', handleToggle);
    window.addEventListener('cart-drawer:close', handleClose);
    return () => {
      window.removeEventListener('cart-drawer:toggle', handleToggle);
      window.removeEventListener('cart-drawer:close', handleClose);
    };
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleEsc);
        document.body.style.overflow = '';
      };
    }
    return undefined;
  }, [open]);

  const items = cart.items ?? [];
  const total = cart.total ?? 0;

  return (
    <>
      {open && (
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 9998,
          }}
        />
      )}
      <aside
        aria-label="Корзина"
        aria-hidden={!open}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          width: 400,
          maxWidth: '100vw',
          background: 'rgb(var(--color-background))',
          color: 'rgb(var(--color-foreground))',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 300ms ease',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: open ? '-8px 0 24px rgba(0,0,0,0.15)' : 'none',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 24px',
            borderBottom: '1px solid rgb(var(--color-muted) / 0.2)',
          }}
        >
          <h2
            className="font-heading"
            style={{ fontSize: 20, textTransform: 'uppercase', margin: 0 }}
          >
            Корзина ({items.length})
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Закрыть"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 28,
              cursor: 'pointer',
              color: 'rgb(var(--color-foreground))',
              padding: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </header>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {items.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'rgb(var(--color-muted))', padding: '48px 0' }}>
              Корзина пуста
            </p>
          ) : (
            items.map((item) => {
              const variantOptions = item.variantTitle
                ? { Вариант: item.variantTitle }
                : undefined;
              const rowItem: CartItemRowData = {
                id: item.variantId,
                productId: item.productId,
                name: item.title,
                imageUrl: item.image,
                priceCents: item.price,
                quantity: item.quantity,
                options: variantOptions,
              };
              return (
                <CartItemRow
                  key={item.variantId}
                  item={rowItem}
                  onIncrement={(id) => cart.updateQuantity(id, (item.quantity ?? 1) + 1)}
                  onDecrement={(id) => cart.updateQuantity(id, Math.max(1, (item.quantity ?? 1) - 1))}
                  onRemove={(id) => cart.removeItem(id)}
                  layout="drawer"
                  showCompareAtPrice={false}
                />
              );
            })
          )}
        </div>

        {items.length > 0 && (
          <footer
            style={{
              padding: '20px 24px',
              borderTop: '1px solid rgb(var(--color-muted) / 0.2)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 16,
                fontSize: 16,
                fontWeight: 500,
              }}
            >
              <span>Итого</span>
              <span>{formatPrice(total)}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <a
                href="/cart"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 48,
                  borderRadius: 8,
                  border: '1px solid rgb(var(--color-foreground))',
                  color: 'rgb(var(--color-foreground))',
                  background: 'rgb(var(--color-background))',
                  textDecoration: 'none',
                  fontSize: 16,
                }}
              >
                В корзину
              </a>
              <a
                href="/checkout"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 48,
                  borderRadius: 8,
                  background: 'rgb(var(--color-foreground))',
                  color: 'rgb(var(--color-background))',
                  textDecoration: 'none',
                  fontSize: 16,
                }}
              >
                Оформить
              </a>
            </div>
          </footer>
        )}
      </aside>
    </>
  );
}

export default CartDrawerIsland;
