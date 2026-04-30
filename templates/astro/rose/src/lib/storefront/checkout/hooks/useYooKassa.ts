import { useCallback, useEffect, useState } from 'react';

/**
 * YooKassa Tokenization JS SDK wrapper.
 *
 * Reference: https://yookassa.ru/developers/payment-acceptance/integration-scenarios/payment-form/tokenization-js
 *
 * SDK exposes a UMD-style global `window.YooMoneyCheckout` (constructor).
 * Earlier code referenced `window.YooMoneyCheckoutUI` which never existed —
 * the loader silently waited forever. Fixed: correct global, instance via
 * `new YooMoneyCheckout(shopId)`, response shape `{ status, data: { response: { paymentToken } } }`.
 */

interface YooMoneyCheckoutTokenizeInput {
  number: string;
  cvc: string;
  month: string;
  year: string; // 2-digit; SDK prepends "20" internally
  fio?: string;
}

interface YooMoneyCheckoutTokenizeResult {
  status: 'success' | 'error';
  data?: { response?: { paymentToken?: string } };
  error?: { code?: string; message?: string };
}

interface YooMoneyCheckoutInstance {
  tokenize: (input: YooMoneyCheckoutTokenizeInput) => Promise<YooMoneyCheckoutTokenizeResult>;
}

interface YooMoneyCheckoutCtor {
  new (shopId: string | number): YooMoneyCheckoutInstance;
}

declare global {
  interface Window {
    YooMoneyCheckout?: YooMoneyCheckoutCtor;
  }
}

const SDK_URL = 'https://static.yoomoney.ru/checkout-js/v1/checkout.js';

export function useYooKassaSdk(): { ready: boolean; failed: boolean } {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.YooMoneyCheckout) {
      setReady(true);
      return;
    }
    const existing = document.querySelector(`script[src="${SDK_URL}"]`) as HTMLScriptElement | null;
    if (existing) {
      const onLoad = () => setReady(Boolean(window.YooMoneyCheckout));
      existing.addEventListener('load', onLoad);
      existing.addEventListener('error', () => setFailed(true));
      // Если скрипт уже загружен (load event пропустили) — проверим прямо сейчас.
      if (window.YooMoneyCheckout) setReady(true);
      return;
    }
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => {
      if (window.YooMoneyCheckout) setReady(true);
      else setFailed(true);
    };
    s.onerror = () => setFailed(true);
    document.head.appendChild(s);
  }, []);

  return { ready, failed };
}

export interface CardInput {
  number: string;
  expiry: string; // MM/YY
  cvc: string;
  nameOnCard?: string;
}

export function useTokenizeCard(shopId: string): {
  tokenize: (card: CardInput) => Promise<string>;
} {
  const tokenize = useCallback(
    async (card: CardInput): Promise<string> => {
      if (typeof window === 'undefined' || !window.YooMoneyCheckout) {
        throw new Error('Платёжный модуль YooKassa не загружен');
      }
      if (!shopId) {
        throw new Error('Не задан YooKassa shopId для токенизации');
      }
      const [mmRaw, yyRaw] = card.expiry.split('/').map((s) => s.trim());
      const mm = (mmRaw ?? '').padStart(2, '0').slice(0, 2);
      // SDK сам префиксует "20" → отдаём 2-значный год.
      const yy = (yyRaw ?? '').slice(-2);
      const checkout = new window.YooMoneyCheckout(shopId);
      const result = await checkout.tokenize({
        number: card.number.replace(/\s+/g, ''),
        month: mm,
        year: yy,
        cvc: card.cvc,
        fio: card.nameOnCard?.trim() || undefined,
      });
      if (result.status !== 'success' || !result.data?.response?.paymentToken) {
        throw new Error(result.error?.message ?? 'Не удалось обработать карту');
      }
      return result.data.response.paymentToken;
    },
    [shopId],
  );

  return { tokenize };
}
