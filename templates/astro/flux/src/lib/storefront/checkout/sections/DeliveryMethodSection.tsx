import { useEffect, useMemo } from 'react';
import { useCheckoutContext, formatRub, type DeliveryMethodChoice } from '../CheckoutContext';
import { useCdek } from '../hooks/useCdek';

export interface DeliveryMethodSectionProps {
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
  const { tariffs, fetchTariffs } = useCdek();

  const cityFiasId = state.delivery.cityFiasId;
  const totalWeightG = state.items.reduce((acc, it) => acc + 500 * it.quantity, 0);

  useEffect(() => {
    if (props.cdekEnabled && cityFiasId) {
      void fetchTariffs(cityFiasId, totalWeightG);
    }
  }, [cityFiasId, totalWeightG, props.cdekEnabled, fetchTariffs]);

  const subtotalCents = state.items
    .filter((i) => !i.isBonus)
    .reduce((acc, i) => acc + i.unitPriceCents * i.quantity, 0);
  const freeShipping =
    props.freeShippingThresholdCents !== null && subtotalCents >= props.freeShippingThresholdCents;

  const choices = useMemo<DeliveryMethodChoice[]>(() => {
    const list: DeliveryMethodChoice[] = [];
    if (props.cdekEnabled) {
      tariffs.forEach((t) => {
        list.push({
          type: 'cdek_door',
          label: `${props.cdekDoorLabel} — ${t.tariff_name}`,
          priceCents: freeShipping ? 0 : t.delivery_sum * 100,
          etaText: `от ${t.period_min} до ${t.period_max} рабочих дней`,
        });
      });
    }
    if (props.pickupEnabled) {
      list.push({ type: 'pickup', label: props.pickupLabel, priceCents: 0 });
    }
    props.customMethods.forEach((m, i) => {
      list.push({
        type: 'custom',
        label: m.label,
        priceCents: freeShipping ? 0 : m.priceCents,
        etaText: m.etaText,
        customId: `custom-${i}`,
      });
    });
    return list;
  }, [tariffs, props, freeShipping]);

  const select = (c: DeliveryMethodChoice) => dispatch({ type: 'SET_DELIVERY_METHOD', method: c });

  if (choices.length === 0) {
    return (
      <p className="text-[length:var(--size-small)] text-[rgb(var(--color-muted))]">
        Введите адрес — мы рассчитаем стоимость доставки.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {choices.map((c, i) => {
        const id = `dm-${i}`;
        const selected =
          state.deliveryMethod?.label === c.label && state.deliveryMethod?.type === c.type;
        return (
          <label
            key={id}
            className={`block px-4 py-4 border rounded-[var(--radius-input)] cursor-pointer transition-colors ${
              selected
                ? 'border-[rgb(var(--color-accent))]'
                : 'border-[rgb(var(--color-input-border))] hover:border-[rgb(var(--color-text)/.4)]'
            }`}
          >
            <input
              type="radio"
              name="delivery-method"
              checked={selected}
              onChange={() => select(c)}
              className="sr-only"
            />
            <div className="flex items-center justify-between gap-3 text-[length:var(--size-body)] text-[rgb(var(--color-text))]">
              <span>{c.label}</span>
              <span>{c.priceCents === 0 ? 'Бесплатно' : formatRub(c.priceCents)}</span>
            </div>
            {c.etaText && (
              <div className="mt-1 text-[length:var(--size-small)] text-[rgb(var(--color-muted))]">{c.etaText}</div>
            )}
          </label>
        );
      })}
    </div>
  );
}
