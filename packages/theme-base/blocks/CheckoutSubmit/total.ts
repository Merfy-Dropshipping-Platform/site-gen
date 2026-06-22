/**
 * CheckoutSubmit — pure total/promo helpers.
 *
 * Дублируют выражения inline IIFE в CheckoutSubmit.astro (inline `is:inline`
 * нельзя импортировать). Держатся здесь как чистые тестируемые функции.
 */

/** Итог к оплате со скидкой: max(0, subtotal − discount + delivery). */
export function computeTotalCents(
  subtotalCents: number,
  discountCents: number,
  deliveryCents: number,
): number {
  return Math.max(0, subtotalCents - (discountCents || 0) + (deliveryCents || 0));
}

/** Тело POST /orders/cart/:id/promo — переприменение промокода в сабмите. */
export function buildPromoRequestBody(code: string): { promoCode: string } {
  return { promoCode: code };
}

/** Сообщение об ошибке переприменения промокода из ответа бэка. */
export function extractPromoErrorMessage(json: unknown): string {
  const msg = (json as { message?: unknown; error?: unknown } | null)?.message;
  if (typeof msg === 'string' && msg.trim()) return msg;
  if (Array.isArray(msg) && typeof msg[0] === 'string' && msg[0].trim()) return msg[0];
  const err = (json as { error?: unknown } | null)?.error;
  if (typeof err === 'string' && err.trim()) return err;
  return 'Промокод больше недействителен — обновите заказ';
}
