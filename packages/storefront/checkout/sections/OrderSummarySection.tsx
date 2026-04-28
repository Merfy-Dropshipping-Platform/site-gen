import { useState } from 'react';
import { useCheckoutContext, formatRub } from '../CheckoutContext';

export interface OrderSummarySectionProps {
  heading?: string;
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

  // Per Figma 1:13403 — items always 120×120 (compact и expanded → одинаковые на десктопе).
  const imgSize =
    props.itemImageSize === 'expanded' ? 'w-[120px] h-[120px]' : 'w-[120px] h-[120px]';

  const applyPromo = async () => {
    if (!state.promoCode || !state.cartId) return;
    setPromoApplying(true);
    try {
      const res = await fetch(`${apiBase}/orders/cart/${state.cartId}/promo`, {
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
    <>
      {props.heading && (
        <h3 className="mb-4 [font-family:var(--font-body)] text-[length:var(--size-h3)] text-[rgb(var(--color-heading))]">{props.heading}</h3>
      )}
    <div className="flex flex-col gap-6">
      {state.items.map((item) => (
        <div key={item.id} className="flex items-start gap-6">
          <div
            className={`${imgSize} rounded-[var(--radius-card)] bg-[rgb(var(--color-input-bg))] flex-shrink-0 relative overflow-hidden`}
            style={item.imageUrl ? { backgroundImage: `url(${item.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          >
            <span className="absolute top-2 left-2 bg-[rgb(var(--color-text))] text-[rgb(var(--color-bg))] text-[length:var(--size-tiny)] font-medium w-5 h-5 rounded-full flex items-center justify-center leading-none">
              {item.quantity}
            </span>
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="[font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))]">{item.name}</span>
              {props.bogoBadge && item.isBonus && (
                <span className="inline-block px-2 py-0.5 rounded-full bg-[rgb(var(--color-accent)/.12)] text-[rgb(var(--color-accent))] text-[length:var(--size-tiny)]">
                  Подарок
                </span>
              )}
            </div>
            {item.variants && (
              <div className="flex flex-col gap-1 text-[length:var(--size-small)] text-[rgb(var(--color-muted))]">
                {Object.entries(item.variants).map(([k, v]) => (
                  <div key={k} className="flex gap-1">
                    {props.showVariantLabels && <span>{k}:</span>}
                    <span className="text-[rgb(var(--color-text))]">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="[font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))]">
              {item.isBonus ? '0₽' : formatRub(item.unitPriceCents)}
            </span>
            {props.showCompareAtPrice && item.compareAtPriceCents && !item.isBonus && (
              <span className="text-[length:var(--size-tiny)] text-[rgb(var(--color-muted))] line-through">
                {formatRub(item.compareAtPriceCents)}
              </span>
            )}
          </div>
        </div>
      ))}

      {props.promoToggle.enabled && (
        <div className="mt-12 flex items-stretch h-14 border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] overflow-hidden bg-[rgb(var(--color-input-bg))] p-1.5 pl-3">
          <input
            className="flex-1 bg-transparent outline-none text-[length:var(--size-body)] text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-input-placeholder))]"
            placeholder={props.promoToggle.label}
            value={state.promoCode}
            onChange={(e) => dispatch({ type: 'SET_PROMO_CODE', code: e.target.value })}
          />
          <button
            type="button"
            disabled={promoApplying || !state.promoCode}
            className="px-3 bg-[rgb(var(--color-accent))] text-[rgb(var(--color-accent-fg))] text-[length:var(--size-small)] rounded-[var(--radius-button)] disabled:opacity-50"
            onClick={applyPromo}
          >
            {promoApplying ? '…' : props.promoToggle.applyButtonText}
          </button>
        </div>
      )}
    </div>
    </>
  );
}
