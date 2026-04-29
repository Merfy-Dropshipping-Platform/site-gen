import { useCart } from '../hooks/useCart';
import { CartItemRow, type CartItemRowData } from './CartItemRow';

export interface CartBodyIslandProps {
  colorScheme?: string;
  padding?: { top: number; bottom: number };
  siteId?: string;
  isGuest?: boolean;
}

export function CartBodyIsland({
  colorScheme,
  padding,
  isGuest = true,
}: CartBodyIslandProps) {
  const cart = useCart();
  const items = cart.items ?? [];
  const isEmpty = items.length === 0;

  const padTop = padding?.top ?? 80;
  const padBottom = padding?.bottom ?? 40;
  const schemeClass = colorScheme ? `color-scheme-${colorScheme.replace('scheme-', '')}` : '';

  return (
    <section
      className={`relative w-full ${schemeClass}`}
      style={{
        background: 'rgb(var(--color-background))',
        color: 'rgb(var(--color-foreground))',
        paddingTop: padTop,
        paddingBottom: padBottom,
      }}
    >
      <div style={{ maxWidth: 768, margin: '0 auto', padding: '0 24px' }}>
        <h1
          className="font-heading"
          style={{
            fontSize: 24,
            lineHeight: '27px',
            textTransform: 'uppercase',
            color: 'rgb(var(--color-foreground))',
            margin: '0 0 25px 0',
          }}
        >
          КОРЗИНА
        </h1>

        {isEmpty && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 0', gap: 16 }}>
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: 'rgb(var(--color-muted))' }}
            >
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <p
              className="font-body"
              style={{ fontSize: 20, lineHeight: '27px', color: 'rgb(var(--color-muted))' }}
            >
              Вы пока не добавили товар в корзину.
            </p>
            <a
              href="/catalog"
              className="font-body"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '12px 24px',
                background: 'rgb(var(--color-foreground))',
                color: 'rgb(var(--color-background))',
                fontSize: 16,
                lineHeight: '22px',
                borderRadius: 8,
                textDecoration: 'none',
              }}
            >
              Продолжить покупки
            </a>
            {isGuest && (
              <p className="font-body" style={{ fontSize: 16, lineHeight: '22px', color: 'rgb(var(--color-muted))' }}>
                Есть аккаунт?{' '}
                <a
                  href="/login?next=/cart"
                  style={{ color: 'rgb(var(--color-foreground))', fontWeight: 500 }}
                >
                  Войти
                </a>
              </p>
            )}
          </div>
        )}

        {!isEmpty && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 50 }}>
            {items.map((item, idx) => {
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
                <div key={item.variantId}>
                  <CartItemRow
                    item={rowItem}
                    onIncrement={(id) => cart.updateQuantity(id, (item.quantity ?? 1) + 1)}
                    onDecrement={(id) => cart.updateQuantity(id, Math.max(1, (item.quantity ?? 1) - 1))}
                    onRemove={(id) => cart.removeItem(id)}
                    layout="page"
                    showCompareAtPrice={true}
                  />
                  {idx < items.length - 1 && (
                    <div
                      style={{
                        width: '100%',
                        height: 0,
                        borderTop: '1px solid rgb(var(--color-muted) / 0.2)',
                        marginTop: 50,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default CartBodyIsland;
