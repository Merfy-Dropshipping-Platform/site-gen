import { useCallback, useEffect, useRef, useState } from 'react';
import { useCheckoutContext, type DeliveryMethodChoice } from '../CheckoutContext';

// Backend response shape of POST /store/carts/:cartId/delivery/calculate?store_id={shopId}
// Mirrors api-gateway store.controller.ts → store.service.calculateDelivery output.
export interface CdekTariff {
  tariffCode: number;
  tariffName: string;
  deliveryMode: 'door' | 'pickup' | string;
  deliverySumRub: number;
  periodMin: number;
  periodMax: number;
}

interface CustomTariff {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
}

interface CustomProfile {
  profileId: string;
  name: string;
  tariffs: CustomTariff[];
}

interface DeliveryOptionsResponse {
  cdekAvailable: boolean;
  tariffs: CdekTariff[];
  pickupAvailable: boolean;
  pickupAddress?: string;
  pickupNotification?: string;
  pickupExpectedDate?: string;
  customProfiles: CustomProfile[];
}

const EMPTY: DeliveryOptionsResponse = {
  cdekAvailable: false,
  tariffs: [],
  pickupAvailable: false,
  customProfiles: [],
};

export function useCdek() {
  const { apiBase, shopId, state } = useCheckoutContext();
  const [data, setData] = useState<DeliveryOptionsResponse>(EMPTY);
  const [loading, setLoading] = useState(false);

  // Stable refs so the inner fetch always reads current values without
  // putting them in fetchTariffs' deps array (otherwise every postal-code
  // change would re-create the callback and fire a duplicate fetch via the
  // auto-refetch effect below).
  const cartIdRef = useRef(state.cartId);
  const postalCodeRef = useRef(state.delivery.postalCode);
  cartIdRef.current = state.cartId;
  postalCodeRef.current = state.delivery.postalCode;

  const fetchTariffs = useCallback(
    async (cityFiasId: string, _weightGramsUnused?: number) => {
      const cartId = cartIdRef.current;
      const postalCode = postalCodeRef.current;
      // Cart + city are both required server-side. Bail early if either is
      // missing — nothing to calculate.
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
          setData(json.data as DeliveryOptionsResponse);
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

  // Build a unified DeliveryMethodChoice list from all sources. Order matches
  // Figma 1:13501 grouping: CDEK first, then pickup, then custom profiles.
  // Defensive fallbacks: arrays default to [] in case backend response is
  // malformed — render code maps over them so a missing field would otherwise
  // crash the whole React Island.
  const safeTariffs = Array.isArray(data.tariffs) ? data.tariffs : [];
  const safeProfiles = Array.isArray(data.customProfiles) ? data.customProfiles : [];

  const choices: DeliveryMethodChoice[] = [
    ...safeTariffs.map((t) => ({
      type: t.deliveryMode === 'door' ? ('cdek_door' as const) : ('cdek_pvz' as const),
      label: t.tariffName ?? 'CDEK',
      priceCents: Number.isFinite(t.deliverySumRub) ? t.deliverySumRub * 100 : 0,
      etaText:
        t.periodMin === t.periodMax
          ? `${t.periodMin} раб. дн.`
          : `от ${t.periodMin} до ${t.periodMax} рабочих дней`,
    })),
    ...(data.pickupAvailable
      ? [
          {
            type: 'pickup' as const,
            label: 'Самовывоз',
            priceCents: 0,
            etaText:
              [data.pickupAddress, data.pickupExpectedDate].filter(Boolean).join(' • ') || undefined,
          },
        ]
      : []),
    ...safeProfiles.flatMap((profile) =>
      (Array.isArray(profile.tariffs) ? profile.tariffs : []).map((t) => ({
        type: 'custom' as const,
        label: t.name ?? 'Доставка',
        priceCents: Number.isFinite(t.priceCents) ? t.priceCents : 0,
        etaText: t.description ?? undefined,
        customId: t.id,
      })),
    ),
  ];

  // Legacy export — DeliveryMethodSection still imports `tariffs` for backwards
  // compat. Map back to the old shape so existing rendering code works while
  // we migrate.
  const tariffs = safeTariffs.map((t) => ({
    tariff_code: t.tariffCode,
    tariff_name: t.tariffName,
    delivery_sum: t.deliverySumRub,
    period_min: t.periodMin,
    period_max: t.periodMax,
    delivery_mode: t.deliveryMode === 'door' ? 1 : 2,
  }));

  return { tariffs, choices, data, loading, fetchTariffs };
}
