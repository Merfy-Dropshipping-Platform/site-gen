import type { CSSProperties } from 'react';

export interface CartItemRowData {
  id: string;
  productId?: string;
  name?: string;
  productName?: string;
  imageUrl?: string;
  images?: (string | { url: string })[];
  image?: string;
  unitPriceCents?: number;
  priceCents?: number;
  price?: number;
  compareAtPriceCents?: number;
  quantity?: number;
  options?: Record<string, string>;
  bonusLine?: boolean;
}

export interface CartItemRowProps {
  item: CartItemRowDataRowData;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onRemove: (id: string) => void;
  layout?: 'page' | 'drawer';
  showCompareAtPrice?: boolean;
}

const formatPrice = (cents: number | undefined): string => {
  if (cents == null) return '0 ₽';
  const rub = cents / 100;
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
  }).format(rub);
};

const parseVariantLines = (item: CartItemRowData): string[] => {
  if (!item.options || typeof item.options !== 'object') return [];
  return Object.entries(item.options).map(([k, v]) => `${k}: ${v}`);
};

const resolveImage = (item: CartItemRowData): string | null => {
  if (item.imageUrl) return item.imageUrl;
  if (Array.isArray(item.images) && item.images.length) {
    const first = item.images[0];
    return typeof first === 'string' ? first : first.url;
  }
  return item.image ?? null;
};

const resolvePrice = (item: CartItemRowData): number => {
  return item.unitPriceCents ?? item.priceCents ?? item.price ?? 0;
};

export function CartItemRow({
  item,
  onIncrement,
  onDecrement,
  onRemove,
  layout = 'page',
  showCompareAtPrice = true,
}: CartItemRowProps) {
  const img = resolveImage(item);
  const name = item.name ?? item.productName ?? 'Товар';
  const price = item.bonusLine ? 0 : resolvePrice(item);
  const qty = item.quantity ?? 1;
  const variantLines = parseVariantLines(item);

  const imgSize = layout === 'drawer' ? 80 : 184;
  const isPageLayout = layout === 'page';

  const rowStyle: CSSProperties = isPageLayout
    ? { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: 184 }
    : { display: 'flex', alignItems: 'center', gap: 12 };

  const imgStyle: CSSProperties = {
    width: imgSize,
    height: imgSize,
    borderRadius: 10,
    objectFit: 'cover',
    flexShrink: 0,
    position: 'relative',
  };

  return (
    <div className="cart-item-row" style={rowStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: isPageLayout ? 50 : 12 }}>
        {img ? (
          <div style={{ position: 'relative' }}>
            <img src={img} alt={name} style={imgStyle} />
            {item.bonusLine && (
              <span
                style={{
                  position: 'absolute',
                  top: 4,
                  left: 4,
                  background: 'rgb(var(--color-primary, 0 0 0))',
                  color: 'rgb(var(--color-primary-text, 255 255 255))',
                  fontSize: 12,
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
              >
                Подарок
              </span>
            )}
          </div>
        ) : (
          <div
            style={{
              ...imgStyle,
              background: 'rgb(var(--color-muted) / 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgb(var(--color-muted))',
            }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21,15 16,10 5,21" />
            </svg>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div
              className="font-body"
              style={{
                fontSize: isPageLayout ? 20 : 14,
                lineHeight: isPageLayout ? '27px' : '18px',
                textTransform: 'uppercase',
                color: 'rgb(var(--color-foreground))',
              }}
            >
              {name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
              <span
                className="font-body"
                style={{
                  fontSize: isPageLayout ? 24 : 14,
                  lineHeight: isPageLayout ? '33px' : '18px',
                  color: 'rgb(var(--color-foreground))',
                }}
              >
                {formatPrice(price)}
              </span>
              {showCompareAtPrice && item.compareAtPriceCents && !item.bonusLine && (
                <span
                  className="font-body"
                  style={{
                    fontSize: 16,
                    lineHeight: '22px',
                    color: 'rgb(var(--color-muted))',
                    textDecoration: 'line-through',
                  }}
                >
                  {formatPrice(item.compareAtPriceCents)}
                </span>
              )}
            </div>
          </div>
          {variantLines.map((line) => (
            <div
              key={line}
              className="font-body"
              style={{ fontSize: 16, lineHeight: '22px', color: 'rgb(var(--color-muted))' }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
      <div
        className="cart-item-actions"
        style={
          isPageLayout
            ? {
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                padding: '15px 0',
                width: 130,
                height: 184,
                boxSizing: 'border-box',
              }
            : { display: 'flex', alignItems: 'center', gap: 8 }
        }
      >
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label="Удалить"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            color: 'rgb(var(--color-muted))',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 6H5H21M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {!item.bonusLine && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <button
              type="button"
              onClick={() => onDecrement(item.id)}
              disabled={qty <= 1}
              style={{
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                border: '1px solid rgb(var(--color-foreground))',
                background: 'rgb(var(--color-background))',
                cursor: qty <= 1 ? 'not-allowed' : 'pointer',
                opacity: qty <= 1 ? 0.4 : 1,
                color: 'rgb(var(--color-foreground))',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M8 16H24" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
            <div
              style={{
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 10,
                background: 'rgb(var(--color-background))',
              }}
            >
              <span
                className="font-body"
                style={{ fontSize: 16, lineHeight: '22px', color: 'rgb(var(--color-foreground))' }}
              >
                {qty}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onIncrement(item.id)}
              style={{
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                border: '1px solid rgb(var(--color-foreground))',
                background: 'rgb(var(--color-background))',
                cursor: 'pointer',
                color: 'rgb(var(--color-foreground))',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M16 8V24M8 16H24" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
