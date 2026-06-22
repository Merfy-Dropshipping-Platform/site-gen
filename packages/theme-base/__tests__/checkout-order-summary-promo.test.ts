import {
  buildPromoRequestBody,
  extractDiscountCents,
  extractPromoErrorMessage,
} from '../blocks/CheckoutOrderSummary/promo';

describe('CheckoutOrderSummary promo helpers', () => {
  describe('buildPromoRequestBody', () => {
    it('uses gateway field name `promoCode` (NOT `code`)', () => {
      const body = buildPromoRequestBody('SALE10');
      expect(body).toEqual({ promoCode: 'SALE10' });
      // Regression guard for the prod-blocker: ApplyPromoDto strips unknown keys.
      expect((body as Record<string, unknown>).code).toBeUndefined();
    });
  });

  describe('extractDiscountCents', () => {
    it('reads data.discountCents when positive', () => {
      expect(extractDiscountCents({ data: { discountCents: 5000 } })).toBe(5000);
    });
    it('returns 0 for missing / zero / negative / malformed', () => {
      expect(extractDiscountCents({ data: { discountCents: 0 } })).toBe(0);
      expect(extractDiscountCents({ data: {} })).toBe(0);
      expect(extractDiscountCents({})).toBe(0);
      expect(extractDiscountCents(null)).toBe(0);
      expect(extractDiscountCents({ data: { discountCents: -10 } })).toBe(0);
    });
  });

  describe('extractPromoErrorMessage', () => {
    it('returns the RU message string from the backend', () => {
      expect(extractPromoErrorMessage({ message: 'Промокод недействителен' })).toBe(
        'Промокод недействителен',
      );
    });
    it('reads the first element when message is an array (class-validator)', () => {
      expect(extractPromoErrorMessage({ message: ['promoCode must be a string'] })).toBe(
        'promoCode must be a string',
      );
    });
    it('falls back when message is absent / empty', () => {
      expect(extractPromoErrorMessage({})).toBe('Не удалось применить промокод');
      expect(extractPromoErrorMessage({ message: '   ' })).toBe('Не удалось применить промокод');
      expect(extractPromoErrorMessage(null)).toBe('Не удалось применить промокод');
    });
  });
});
