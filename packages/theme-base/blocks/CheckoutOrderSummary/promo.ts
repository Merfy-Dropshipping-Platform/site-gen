/**
 * CheckoutOrderSummary — pure promo-code helpers.
 *
 * Эти функции дублируют выражения, которые исполняет inline IIFE в
 * CheckoutOrderSummary.astro (inline `is:inline` нельзя импортировать — Astro
 * не бандлит его). Логика держится здесь как чистые, тестируемые функции и
 * сверяется тестами с ожидаемым контрактом gateway (`ApplyPromoDto { promoCode }`).
 */

/** Тело POST /orders/cart/:id/promo. Gateway ApplyPromoDto ожидает { promoCode }. */
export function buildPromoRequestBody(code: string): { promoCode: string } {
  return { promoCode: code };
}

/** Скидка в копейках из ответа gateway (`{ data: { discountCents } }`). */
export function extractDiscountCents(json: unknown): number {
  const data = (json as { data?: { discountCents?: unknown } } | null)?.data;
  const v = data?.discountCents;
  return typeof v === 'number' && v > 0 ? v : 0;
}

/**
 * Русский текст ошибки от бэка (`{ message }`) для показа покупателю.
 * gateway отдаёт HttpException(res.message, 400) → { statusCode, message }.
 */
export function extractPromoErrorMessage(json: unknown): string {
  const msg = (json as { message?: unknown } | null)?.message;
  if (typeof msg === 'string' && msg.trim()) return msg;
  if (Array.isArray(msg) && typeof msg[0] === 'string' && msg[0].trim()) return msg[0];
  return 'Не удалось применить промокод';
}
