import { useCallback, useEffect, useState } from 'react';
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

  const fetchTariffs = useCallback(
    async (cityFiasId: string, _weightGramsUnused?: number) => {
      // Cart + city are both required server-side. Bail early if either is
      // missing — nothing to calculate.
      if (!state.cartId || !cityFiasId || !shopId) return;
      setLoading(true);
      try {
        const url = `${apiBase}/store/carts/${state.cartId}/delivery/calculate?store_id=${encodeURIComponent(shopId)}`;
        const body: Record<string, string> = { cityFiasId };
        if (state.delivery.postalCode) body.postalCode = state.delivery.postalCode;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          credentials: 'include',
        });
        const json = await res.json();
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
    [apiBase, shopId, state.cartId, state.delivery.postalCode],
  );

  // Auto-refetch whenever the cart or city FIAS changes — keeps options fresh
  // as the customer types their address.
  useEffect(() => {
    if (state.delivery.cityFiasId) void fetchTariffs(state.delivery.cityFiasId);
  }, [state.delivery.cityFiasId, fetchTariffs]);

  // Build a unified DeliveryMethodChoice list from all sources. Order matches
  // Figma 1:13501 grouping: CDEK first, then pickup, then custom profiles.
  const choices: DeliveryMethodChoice[] = [
    ...data.tariffs.map((t) => ({
      type: t.deliveryMode === 'door' ? ('cdek_door' as const) : ('cdek_pvz' as const),
      label: t.tariffName,
      priceCents: t.deliverySumRub * 100,
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
    ...data.customProfiles.flatMap((profile) =>
      profile.tariffs.map((t) => ({
        type: 'custom' as const,
        label: t.name,
        priceCents: t.priceCents,
        etaText: t.description ?? undefined,
        customId: t.id,
      })),
    ),
  ];

  // Legacy export — DeliveryMethodSection still imports `tariffs` for backwards
  // compat. Map back to the old shape so existing rendering code works while
  // we migrate.
  const tariffs = data.tariffs.map((t) => ({
    tariff_code: t.tariffCode,
    tariff_name: t.tariffName,
    delivery_sum: t.deliverySumRub,
    period_min: t.periodMin,
    period_max: t.periodMax,
    delivery_mode: t.deliveryMode === 'door' ? 1 : 2,
  }));

  return { tariffs, choices, data, loading, fetchTariffs };
}
