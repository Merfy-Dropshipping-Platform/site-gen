import { useState } from 'react';
import { useCheckoutContext, formatRub } from '../CheckoutContext';

export interface OrderSummarySectionProps {
  itemImageSize: 'compact' | 'expanded';
  showVariantLabels: boolean;
  showCompareAtPrice: boolean;
  promoToggle: { enabled: boolean; label: string; applyButtonText: string };
  bogoBadge: boolean;
}

export function OrderSummarySection(props: OrderSummarySectionProps) {
  const { state, dispatch, apiBase } = useCheckoutContext();
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoApplying, setPromoApplying] = useState(false);

  const imgSize =
    props.itemImageSize === 'expanded' ? 'w-[120px] h-[120px]' : 'w-24 h-24';

  const applyPromo = async () => {
    if (!state.promoCode || !state.cartId) return;
    setPromoApplying(true);
    try {
      const res = await fetch(`${apiBase}/checkout/cart/${state.cartId}/promo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: state.promoCode }),
        credentials: 'include',
      });
      const json = await res.json();
      if (json?.data?.discountCents) {
        dispatch({ type: 'SET_DISCOUNT', discountCents: json.data.discountCents });
      }
    } finally {
      setPromoApplying(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {state.items.map((item) => (
        <div key={item.id} className="flex items-start gap-3">
          <div
            className={`${imgSize} rounded-[var(--radius-card)] bg-[rgb(var(--color-input-bg))] flex-shrink-0 relative overflow-hidden`}
            style={item.imageUrl ? { backgroundImage: `url(${item.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          >
            {item.quantity > 1 && (
              <span className="absolute -top-1 -right-1 bg-[rgb(var(--color-text))] text-[rgb(var(--color-bg))] text-[length:var(--size-tiny)] w-5 h-5 rounded-full flex items-center justify-center">
                {item.quantity}
              </span>
            )}
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="[font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))]">{item.name}</span>
              {props.bogoBadge && item.isBonus && (
                <span className="inline-block px-2 py-0.5 rounded-full bg-[rgb(var(--color-accent)/.12)] text-[rgb(var(--color-accent))] text-[length:var(--size-tiny)]">
                  Подарок
                </span>
              )}
            </div>
            {item.variants && (
              <div className="flex flex-col gap-0.5 text-[length:var(--size-small)] text-[rgb(var(--color-muted))]">
                {Object.entries(item.variants).map(([k, v]) => (
                  <div key={k}>
                    {props.showVariantLabels && <span>{k}: </span>}
                    <span className="text-[rgb(var(--color-text))]">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end">
            <span className="[font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))] font-semibold">
              {item.isBonus ? '0₽' : formatRub(item.unitPriceCents)}
            </span>
            {props.showCompareAtPrice && item.compareAtPriceCents && !item.isBonus && (
              <span className="text-[length:var(--size-small)] text-[rgb(var(--color-muted))] line-through">
                {formatRub(item.compareAtPriceCents)}
              </span>
            )}
          </div>
        </div>
      ))}

      {props.promoToggle.enabled && (
        <div className="mt-2">
          {!promoOpen ? (
            <button
              type="button"
              className="text-[length:var(--size-body)] text-[rgb(var(--color-text))] underline"
              onClick={() => setPromoOpen(true)}
            >
              {props.promoToggle.label}
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 border border-dashed border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)]">
              <input
                className="flex-1 bg-transparent outline-none text-[length:var(--size-body)] text-[rgb(var(--color-text))]"
                placeholder="MERFY10"
                value={state.promoCode}
                onChange={(e) => dispatch({ type: 'SET_PROMO_CODE', code: e.target.value })}
              />
              <button
                type="button"
                disabled={promoApplying || !state.promoCode}
                className="px-3 py-1.5 bg-[rgb(var(--color-accent))] text-[rgb(var(--color-accent-fg))] rounded-[var(--radius-button)] text-[length:var(--size-small)] disabled:opacity-50"
                onClick={applyPromo}
              >
                {promoApplying ? '…' : props.promoToggle.applyButtonText}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
