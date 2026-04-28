import { useCheckoutContext, computeTotals, formatRub } from '../CheckoutContext';

export interface TotalsSectionProps {
  deliveryLabel: string;
  freeText: string;
  totalLabel: string;
  showSubtotal: boolean;
  showDiscount: boolean;
}

export function TotalsSection(props: TotalsSectionProps) {
  const { state } = useCheckoutContext();
  const { subtotalCents, deliveryCents, discountCents, totalCents } = computeTotals(state);

  return (
    <div className="w-full flex flex-col gap-3">
      {props.showSubtotal && (
        <div className="flex items-center justify-between text-[length:var(--size-body)] text-[rgb(var(--color-text))] [font-family:var(--font-body)]">
          <span>Подытог</span>
          <span>{formatRub(subtotalCents)}</span>
        </div>
      )}
      <div className="flex items-center justify-between text-[length:var(--size-body)] text-[rgb(var(--color-text))] [font-family:var(--font-body)]">
        <span>{props.deliveryLabel}</span>
        <span className="text-[length:var(--size-small)]">{deliveryCents === 0 ? props.freeText : formatRub(deliveryCents)}</span>
      </div>
      {props.showDiscount && discountCents > 0 && (
        <div className="flex items-center justify-between text-[length:var(--size-body)] text-[rgb(var(--color-text))]">
          <span>Скидка</span>
          <span>−{formatRub(discountCents)}</span>
        </div>
      )}
      <div className="flex items-center justify-between text-[length:var(--size-h2)] text-[rgb(var(--color-text))] [font-family:var(--font-body)]">
        <span>{props.totalLabel}</span>
        <span>{formatRub(totalCents)}</span>
      </div>
    </div>
  );
}
