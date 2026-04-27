import { useState } from 'react';
import { useCheckoutContext, computeTotals, formatRub } from '../CheckoutContext';

export interface SummaryToggleSectionProps {
  headerText: string;
  dropdownIcon: 'chevron' | 'arrow';
}

export function SummaryToggleSection(props: SummaryToggleSectionProps) {
  const { state } = useCheckoutContext();
  const [open, setOpen] = useState(false);
  const { totalCents } = computeTotals(state);

  return (
    <div className="w-full">
      <button
        type="button"
        className="flex items-center justify-between w-full"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2 [font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))]">
          <span>{props.headerText}</span>
          {props.dropdownIcon === 'chevron' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d={open ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12l7 7 7-7" />
            </svg>
          )}
        </span>
        <span className="[font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))] font-semibold">
          {formatRub(totalCents)}
        </span>
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-2 text-[length:var(--size-small)] text-[rgb(var(--color-text))]">
          {state.items.map((it) => (
            <div key={it.id} className="flex items-center justify-between">
              <span>
                {it.name}
                {it.quantity > 1 ? ` × ${it.quantity}` : ''}
              </span>
              <span>{it.isBonus ? '0₽' : formatRub(it.unitPriceCents * it.quantity)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
