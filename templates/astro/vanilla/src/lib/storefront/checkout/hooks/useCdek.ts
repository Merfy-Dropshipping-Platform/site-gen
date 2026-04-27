import { useCallback, useState } from 'react';
import { useCheckoutContext, type DeliveryMethodChoice } from '../CheckoutContext';

export interface CdekTariff {
  tariff_code: number;
  tariff_name: string;
  delivery_sum: number;
  period_min: number;
  period_max: number;
  delivery_mode: number;
}

export interface CdekPvz {
  code: string;
  name: string;
  address: string;
  work_time: string;
  type: string;
}

export function useCdek() {
  const { apiBase } = useCheckoutContext();
  const [tariffs, setTariffs] = useState<CdekTariff[]>([]);
  const [pvz, setPvz] = useState<CdekPvz[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTariffs = useCallback(
    async (cityFiasId: string, weightGrams: number) => {
      setLoading(true);
      try {
        const res = await fetch(`${apiBase}/checkout/cdek-tariffs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cityFiasId, weightGrams }),
          credentials: 'include',
        });
        const json = await res.json();
        setTariffs((json?.data?.tariffs ?? []) as CdekTariff[]);
      } finally {
        setLoading(false);
      }
    },
    [apiBase],
  );

  const fetchPvz = useCallback(
    async (cityFiasId: string) => {
      setLoading(true);
      try {
        const res = await fetch(`${apiBase}/checkout/cdek-pvz`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cityFiasId }),
          credentials: 'include',
        });
        const json = await res.json();
        setPvz((json?.data?.pvz ?? []) as CdekPvz[]);
      } finally {
        setLoading(false);
      }
    },
    [apiBase],
  );

  const tariffsToChoices = (label: string): DeliveryMethodChoice[] =>
    tariffs.map((t) => ({
      type: 'cdek_door',
      label: `${label} — ${t.tariff_name}`,
      priceCents: t.delivery_sum * 100,
      etaText: `от ${t.period_min} до ${t.period_max} рабочих дней`,
    }));

  return { tariffs, pvz, loading, fetchTariffs, fetchPvz, tariffsToChoices };
}
