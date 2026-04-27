import { useCallback, useEffect, useState } from 'react';

declare global {
  interface Window {
    YooMoneyCheckoutUI?: {
      tokenize: (params: {
        number: string;
        cvc: string;
        month: string;
        year: string;
      }) => Promise<{ status: 'success' | 'error'; data?: { paymentToken: string }; error?: { code?: string; message?: string } }>;
    };
  }
}

const SDK_URL = 'https://static.yoomoney.ru/checkout-js/v1/checkout.js';

export function useYooKassaSdk(): { ready: boolean; failed: boolean } {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.YooMoneyCheckoutUI) {
      setReady(true);
      return;
    }
    const existing = document.querySelector(`script[src="${SDK_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => setReady(true));
      existing.addEventListener('error', () => setFailed(true));
      return;
    }
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => setReady(Boolean(window.YooMoneyCheckoutUI));
    s.onerror = () => setFailed(true);
    document.head.appendChild(s);
  }, []);

  return { ready, failed };
}

export interface CardInput {
  number: string;
  expiry: string; // MM/YY
  cvc: string;
}

export function useTokenizeCard(): {
  tokenize: (card: CardInput) => Promise<string>;
} {
  const tokenize = useCallback(async (card: CardInput): Promise<string> => {
    if (typeof window === 'undefined' || !window.YooMoneyCheckoutUI) {
      throw new Error('YooKassa SDK не загружен');
    }
    const [mm, yy] = card.expiry.split('/').map((s) => s.trim());
    const result = await window.YooMoneyCheckoutUI.tokenize({
      number: card.number.replace(/\s+/g, ''),
      month: mm,
      year: yy.length === 2 ? '20' + yy : yy,
      cvc: card.cvc,
    });
    if (result.status !== 'success' || !result.data?.paymentToken) {
      throw new Error(result.error?.message ?? 'Не удалось обработать карту');
    }
    return result.data.paymentToken;
  }, []);

  return { tokenize };
}
