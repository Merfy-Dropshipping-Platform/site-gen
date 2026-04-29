import { useCheckoutContext, formatRub, type DeliveryMethodChoice } from '../CheckoutContext';
import { useCdek } from '../hooks/useCdek';

// Most props are vestigial now — the unified `useCdek` hook returns CDEK
// tariffs, pickup, and custom profiles already merged into one `choices` list.
// We keep the prop signature so existing puckConfig + Astro SSR don't break.
export interface DeliveryMethodSectionProps {
  heading?: string;
  cdekEnabled: boolean;
  cdekDoorLabel: string;
  cdekPvzLabel: string;
  pickupEnabled: boolean;
  pickupLabel: string;
  customMethods: Array<{ label: string; priceCents: number; etaText: string }>;
  freeShippingThresholdCents: number | null;
}

export function DeliveryMethodSection(props: DeliveryMethodSectionProps) {
  const { state, dispatch } = useCheckoutContext();
  const { choices, loading } = useCdek();

  const subtotalCents = state.items
    .filter((i) => !i.isBonus)
    .reduce((acc, i) => acc + i.unitPriceCents * i.quantity, 0);
  const freeShipping =
    props.freeShippingThresholdCents !== null && subtotalCents >= props.freeShippingThresholdCents;

  // Apply free-shipping threshold to non-pickup choices (pickup is always 0).
  const displayChoices = freeShipping
    ? choices.map((c) => (c.type === 'pickup' ? c : { ...c, priceCents: 0 }))
    : choices;

  const select = (c: DeliveryMethodChoice) => dispatch({ type: 'SET_DELIVERY_METHOD', method: c });

  const Heading = () =>
    props.heading ? (
      <h2 className="mb-4 [font-family:var(--font-body)] text-[length:var(--size-h3)] text-[rgb(var(--color-heading))]">
        {props.heading}
      </h2>
    ) : null;

  // Empty state: city not picked yet, or city picked but no methods returned.
  if (displayChoices.length === 0) {
    const message = !state.delivery.cityFiasId
      ? 'Введите адрес — мы рассчитаем стоимость доставки.'
      : loading
      ? 'Считаем варианты доставки…'
      : 'Для этого города нет доступных вариантов доставки.';
    return (
      <>
        <Heading />
        <p className="text-[length:var(--size-small)] text-[rgb(var(--color-muted))]">{message}</p>
      </>
    );
  }

  // Per Figma 1:13501 — each row is 60h, 12px horizontal padding, two-line
  // content (label+price on top, ETA below in muted color), 16px vertical gap.
  return (
    <>
      <Heading />
      <div className="flex flex-col gap-4">
        {displayChoices.map((c, i) => {
          const id = `dm-${c.type}-${c.customId ?? c.label}-${i}`;
          const selected =
            state.deliveryMethod?.label === c.label && state.deliveryMethod?.type === c.type;
          return (
            <label
              key={id}
              htmlFor={id}
              className={`flex flex-col justify-center min-h-[60px] px-3 py-2 border rounded-[var(--radius-input)] cursor-pointer transition-colors ${
                selected
                  ? 'border-[rgb(var(--color-text))]'
                  : 'border-[rgb(var(--color-input-border))] hover:border-[rgb(var(--color-text)/.4)]'
              }`}
            >
              <input
                id={id}
                type="radio"
                name="delivery-method"
                checked={selected}
                onChange={() => select(c)}
                className="sr-only"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="[font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))]">
                  {c.label}
                </span>
                <span className="[font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))]">
                  {c.priceCents === 0 ? 'Бесплатно' : formatRub(c.priceCents)}
                </span>
              </div>
              {c.etaText && (
                <div className="mt-0.5 text-[length:var(--size-small)] text-[rgb(var(--color-muted))]">
                  {c.etaText}
                </div>
              )}
            </label>
          );
        })}
      </div>
    </>
  );
}
