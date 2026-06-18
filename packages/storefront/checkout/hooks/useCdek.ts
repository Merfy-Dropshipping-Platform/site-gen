import { useCallback, useEffect, useRef, useState } from 'react';
import { useCheckoutContext, type DeliveryMethodChoice } from '../CheckoutContext';

// Backend response of POST /store/carts/:cartId/delivery/calculate?store_id={shopId}.
// The logistics service (reworked — profile + whitelist logic) returns a flat
// `deliveryOptions[]`: each is an OWN (fixed price) or PARTNER (CDEK-calculated)
// delivery method, already filtered by the shop's active delivery profile.
// Mirrors logistic CalculateDeliveryResultDto → orders/gateway pass it through.
export interface DeliveryOption {
  id: string;
  name: string;
  type: 'OWN' | 'PARTNER';
  price: number; // RUBLES (storefront formats; order metadata carries cents)
  minDays?: number;
  maxDays?: number;
  description?: string;
  cdekTariffCode?: number;
  deliveryMode?: 'door' | 'pickup';
}

export interface DeliveryPickupPoint {
  id: string;
  address: string;
  city?: string | null;
  notificationMessage?: string | null;
  estimatedReadyTime?: string | null;
}

interface DeliveryCalcResponse {
  deliveryOptions: DeliveryOption[];
  pickupPoints?: DeliveryPickupPoint[];
  cdekError?: string;
}

const EMPTY: DeliveryCalcResponse = { deliveryOptions: [] };

export function useCdek() {
  const { apiBase, shopId, state } = useCheckoutContext();
  const [data, setData] = useState<DeliveryCalcResponse>(EMPTY);
  const [loading, setLoading] = useState(false);

  // Stable refs so the inner fetch always reads current values without putting
  // them in fetchTariffs' deps (otherwise every postal-code change re-creates
  // the callback and fires a duplicate fetch via the auto-refetch effect below).
  const cartIdRef = useRef(state.cartId);
  const postalCodeRef = useRef(state.delivery.postalCode);
  cartIdRef.current = state.cartId;
  postalCodeRef.current = state.delivery.postalCode;

  const fetchTariffs = useCallback(
    async (cityFiasId: string, _weightGramsUnused?: number) => {
      const cartId = cartIdRef.current;
      const postalCode = postalCodeRef.current;
      // Cart + city are both required server-side. Bail early if either is missing.
      if (!cartId || !cityFiasId || !shopId) return;
      setLoading(true);
      try {
        const url = `${apiBase}/store/carts/${cartId}/delivery/calculate?store_id=${encodeURIComponent(shopId)}`;
        const body: Record<string, string> = { cityFiasId };
        if (postalCode) body.postalCode = postalCode;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          credentials: 'include',
        });
        if (!res.ok) {
          setData(EMPTY);
          return;
        }
        const json = await res.json().catch(() => null);
        if (json?.success && json?.data) {
          setData(json.data as DeliveryCalcResponse);
        } else {
          setData(EMPTY);
        }
      } catch {
        setData(EMPTY);
      } finally {
        setLoading(false);
      }
    },
    [apiBase, shopId],
  );

  // Auto-refetch whenever the city FIAS changes — keeps options fresh as the
  // customer types their address. Bail to EMPTY when no FIAS is set yet so a
  // previous response isn't shown after the user clears the field.
  useEffect(() => {
    if (state.delivery.cityFiasId) {
      void fetchTariffs(state.delivery.cityFiasId);
    } else {
      setData(EMPTY);
    }
  }, [state.delivery.cityFiasId, fetchTariffs]);

  const etaText = (
    min?: number,
    max?: number,
    desc?: string,
  ): string | undefined => {
    if (min == null || max == null) return desc || undefined;
    return min === max
      ? `${min} раб. дн.`
      : `от ${min} до ${max} рабочих дней`;
  };

  // Map logistics `deliveryOptions` → the unified DeliveryMethodChoice list the
  // UI renders. PARTNER door → cdek_door, PARTNER pickup → cdek_pvz, OWN → custom
  // (merchant fixed-price). Defensive [] fallback — render code maps over it.
  const options = Array.isArray(data.deliveryOptions) ? data.deliveryOptions : [];
  const choices: DeliveryMethodChoice[] = options.map((o) => ({
    type:
      o.type === 'OWN'
        ? ('custom' as const)
        : o.deliveryMode === 'door'
          ? ('cdek_door' as const)
          : ('cdek_pvz' as const),
    label: o.name ?? 'Доставка',
    priceCents: Number.isFinite(o.price) ? Math.round(o.price * 100) : 0,
    etaText: etaText(o.minDays, o.maxDays, o.description),
    customId: o.type === 'OWN' ? o.id : undefined,
    cdekTariffCode: o.cdekTariffCode,
    periodMin: o.minDays,
    periodMax: o.maxDays,
  }));

  // Shop self-pickup (settings.isPickupEnabled) → single «Самовывоз» choice (0 ₽).
  const pickupPoints = Array.isArray(data.pickupPoints) ? data.pickupPoints : [];
  if (pickupPoints.length > 0) {
    const first = pickupPoints[0];
    choices.push({
      type: 'pickup',
      label: 'Самовывоз',
      priceCents: 0,
      etaText:
        [first?.address, first?.notificationMessage].filter(Boolean).join(' • ') ||
        undefined,
      pvzCode: first?.id,
    });
  }

  return { choices, data, loading, cdekError: data.cdekError, fetchTariffs };
}
