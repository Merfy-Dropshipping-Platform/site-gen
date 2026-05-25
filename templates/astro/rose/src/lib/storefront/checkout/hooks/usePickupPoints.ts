import { useCallback, useEffect, useRef, useState } from 'react';
import { useCheckoutContext } from '../CheckoutContext';

export interface PickupPoint {
  code: string;
  name: string;
  address: string;
  workTime: string;
  type: 'PVZ' | 'POSTAMAT';
}

interface Cache {
  [cityFiasId: string]: PickupPoint[];
}

const cache: Cache = {};

/**
 * Fetches CDEK ПВЗ list for current city. Cached per cityFiasId so re-render
 * не дёргает API повторно. Auto-fetches на change cityFiasId; bail когда
 * city не выбран.
 */
export function usePickupPoints(): {
  points: PickupPoint[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const { apiBase, shopId, state } = useCheckoutContext();
  const cityFiasId = state.delivery.cityFiasId;
  const cartId = state.cartId;
  const [points, setPoints] = useState<PickupPoint[]>(
    cityFiasId ? cache[cityFiasId] ?? [] : [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const doFetch = useCallback(async () => {
    if (!cityFiasId || !cartId || !shopId) {
      setPoints([]);
      return;
    }
    if (cache[cityFiasId]) {
      setPoints(cache[cityFiasId]);
      return;
    }
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const url = `${apiBase}/store/carts/${cartId}/delivery/pickup-points?store_id=${encodeURIComponent(shopId)}&cityFiasId=${encodeURIComponent(cityFiasId)}`;
      const res = await fetch(url, { credentials: 'include' });
      if (reqId !== reqIdRef.current) return; // stale
      if (!res.ok) {
        setError('Не удалось загрузить пункты выдачи');
        setPoints([]);
        return;
      }
      const json = await res.json().catch(() => null);
      const list: PickupPoint[] = Array.isArray(json?.data) ? json.data : [];
      cache[cityFiasId] = list;
      setPoints(list);
    } catch {
      if (reqId === reqIdRef.current) {
        setError('Ошибка сети');
        setPoints([]);
      }
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [apiBase, shopId, cartId, cityFiasId]);

  useEffect(() => {
    void doFetch();
  }, [doFetch]);

  return { points, loading, error, refresh: doFetch };
}
