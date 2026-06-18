import { useCallback, useEffect, useRef, useState } from 'react';
import { useCheckoutContext, type DeliveryMethodChoice } from '../CheckoutContext';

// Реальный ответ POST /store/carts/:cartId/delivery/calculate?store_id={shopId}.
// Источник истины — logistic CalculateDeliveryResultDto, который orders/gateway
// релеят как есть (включая cdekError, хоть его и нет в orders-типе).
export interface DeliveryOption {
  id: string;
  name: string;
  type: 'OWN' | 'PARTNER' | string;
  price: number; // РУБЛИ (не копейки)
  minDays?: number;
  maxDays?: number;
  description?: string;
  cdekTariffCode?: number; // только PARTNER
  deliveryMode?: 'door' | 'pickup'; // только PARTNER
}

export interface CalcPickupPoint {
  id: string;
  address: string;
  city?: string;
  notificationMessage?: string;
  estimatedReadyTime?: string;
}

export interface UnavailableProduct {
  productId: string;
  variantId?: string;
}

interface DeliveryCalcResponse {
  deliveryOptions: DeliveryOption[];
  pickupPoints?: CalcPickupPoint[];
  unavailableProducts?: UnavailableProduct[];
  cdekError?: string;
}

const EMPTY: DeliveryCalcResponse = { deliveryOptions: [] };

// estimatedReadyTime — enum СДЭК/самовывоза, маппим в человекочитаемый текст.
const READY_TIME_LABEL: Record<string, string> = {
  HOUR_1: 'в течение часа',
  HOURS_2: 'в течение 2 часов',
  HOURS_24: 'в течение 24 часов',
  DAYS_2_4: '2–4 дня',
};

function periodText(min?: number, max?: number): string | undefined {
  if (min != null && max != null) {
    return min === max ? `${min} раб. дн.` : `от ${min} до ${max} рабочих дней`;
  }
  // Односторонний срок не теряем (частичный ответ СДЭК).
  if (min != null) return `от ${min} раб. дн.`;
  if (max != null) return `до ${max} раб. дн.`;
  return undefined;
}

export function useCdek() {
  const { apiBase, shopId, state } = useCheckoutContext();
  const [data, setData] = useState<DeliveryCalcResponse>(EMPTY);
  const [loading, setLoading] = useState(false);

  // Stable refs so the inner fetch always reads current values without
  // putting them in fetchTariffs' deps (otherwise every postal-code change
  // would re-create the callback and fire a duplicate fetch).
  const cartIdRef = useRef(state.cartId);
  const postalCodeRef = useRef(state.delivery.postalCode);
  cartIdRef.current = state.cartId;
  postalCodeRef.current = state.delivery.postalCode;

  const fetchTariffs = useCallback(
    async (cityFiasId: string) => {
      const cartId = cartIdRef.current;
      const postalCode = postalCodeRef.current;
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

  // Авто-пересчёт при смене города (FIAS). Сброс в EMPTY когда город очищен.
  useEffect(() => {
    if (state.delivery.cityFiasId) {
      void fetchTariffs(state.delivery.cityFiasId);
    } else {
      setData(EMPTY);
    }
  }, [state.delivery.cityFiasId, fetchTariffs]);

  const safeOptions = Array.isArray(data.deliveryOptions) ? data.deliveryOptions : [];
  const safePickup = Array.isArray(data.pickupPoints) ? data.pickupPoints : [];

  // Единый список вариантов (как в эталоне theme-base/CheckoutDeliveryMethod):
  //  PARTNER + deliveryMode door/pickup → cdek_door / cdek_pvz (несут cdekTariffCode);
  //  OWN → custom (свой тариф магазина);
  //  pickupPoints → самовывоз (бесплатно).
  // Цена price (рубли) → копейки. Все источники в одном списке.
  const choices: DeliveryMethodChoice[] = [
    ...safeOptions.map((o): DeliveryMethodChoice => {
      const priceCents = Number.isFinite(o.price) ? Math.round(o.price * 100) : 0;
      if (o.type === 'PARTNER') {
        const isDoor = o.deliveryMode === 'door';
        return {
          type: isDoor ? 'cdek_door' : 'cdek_pvz',
          label: o.name || 'СДЭК',
          priceCents,
          etaText: periodText(o.minDays, o.maxDays) ?? o.description ?? undefined,
          cdekTariffCode: o.cdekTariffCode,
          periodMin: o.minDays,
          periodMax: o.maxDays,
        };
      }
      return {
        type: 'custom',
        label: o.name || 'Доставка',
        priceCents,
        // OWN: описание тарифа приоритетнее расчётного срока (у своей доставки
        // мерчант пишет осмысленный текст); у PARTNER приоритет обратный — там
        // живой срок от СДЭК важнее.
        etaText: o.description ?? periodText(o.minDays, o.maxDays) ?? undefined,
        customId: o.id,
        periodMin: o.minDays,
        periodMax: o.maxDays,
      };
    }),
    ...safePickup.map((p): DeliveryMethodChoice => ({
      type: 'pickup',
      // Несколько точек самовывоза → разводим лейбл по городу/адресу, иначе
      // выбор по label+type схлопнул бы их в одну.
      label: safePickup.length > 1 ? `Самовывоз: ${p.city || p.address}` : 'Самовывоз',
      priceCents: 0,
      etaText:
        [
          p.address,
          p.estimatedReadyTime
            ? READY_TIME_LABEL[p.estimatedReadyTime] ?? p.estimatedReadyTime
            : null,
        ]
          .filter(Boolean)
          .join(' • ') || undefined,
    })),
  ];

  return {
    choices,
    loading,
    cdekError: data.cdekError,
    unavailableProducts: Array.isArray(data.unavailableProducts)
      ? data.unavailableProducts
      : [],
    data,
    fetchTariffs,
  };
}
