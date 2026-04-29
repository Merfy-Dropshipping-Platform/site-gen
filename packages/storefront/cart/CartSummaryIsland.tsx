import { useCart } from '../hooks/useCart';

export interface CartSummaryIslandProps {
  colorScheme?: string;
  padding?: { top: number; bottom: number };
  siteId?: string;
}

const formatPrice = (cents: number): string => {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
  }).format(cents / 100);
};

export function CartSummaryIsland({ colorScheme, padding }: CartSummaryIslandProps) {
  const cart = useCart();
  const items = cart.items ?? [];
  const total = cart.total ?? 0;

  if (items.length === 0) return null;

  const padTop = padding?.top ?? 0;
  const padBottom = padding?.bottom ?? 80;
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 25 }}>
          <p
            className="font-body"
            style={{
              fontSize: 16,
              lineHeight: '22px',
              color: 'rgb(var(--color-muted))',
              textAlign: 'right',
              margin: 0,
              maxWidth: 318,
            }}
          >
            Налоги, скидки и стоимость доставки рассчитываются при оформлении заказа.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
            <span
              className="font-body"
              style={{ fontSize: 20, lineHeight: '27px', color: 'rgb(var(--color-foreground))' }}
            >
              Итого
            </span>
            <span
              className="font-body"
              style={{ fontSize: 20, lineHeight: '27px', color: 'rgb(var(--color-foreground))' }}
            >
              {formatPrice(total)}
            </span>
          </div>
          <a
            href="/checkout"
            className="font-body"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 195,
              height: 60,
              fontSize: 20,
              lineHeight: '27px',
              borderRadius: 10,
              background: 'rgb(var(--color-foreground))',
              color: 'rgb(var(--color-background))',
              textDecoration: 'none',
            }}
          >
            Оформить заказ
          </a>
        </div>
      </div>
    </section>
  );
}

export default CartSummaryIsland;
