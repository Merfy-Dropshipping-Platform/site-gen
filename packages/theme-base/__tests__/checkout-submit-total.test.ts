import {
  computeTotalCents,
  buildPromoRequestBody,
  extractPromoErrorMessage,
} from "../blocks/CheckoutSubmit/total";

describe("CheckoutSubmit total/promo helpers", () => {
  describe("computeTotalCents", () => {
    it("subtracts discount and adds delivery", () => {
      // subtotal 1000, discount 200, delivery 150 → 950
      expect(computeTotalCents(1000, 200, 150)).toBe(950);
    });
    it("ignores discount when 0", () => {
      expect(computeTotalCents(1000, 0, 150)).toBe(1150);
    });
    it("clamps to 0 when discount exceeds subtotal", () => {
      expect(computeTotalCents(500, 800, 0)).toBe(0);
    });
    it("treats falsy discount/delivery as 0", () => {
      // @ts-expect-error — runtime guards against undefined from event detail
      expect(computeTotalCents(1000, undefined, undefined)).toBe(1000);
    });

    // PR-19 — extensionDiscountCents (скидка точки расширений «Оформление заказа»).
    it("subtracts extensionDiscountCents in addition to promo discount", () => {
      // subtotal 1000, promo 100, extension 150, delivery 0 → 750
      expect(computeTotalCents(1000, 100, 0, 150)).toBe(750);
    });
    it("extensionDiscountCents defaults to 0 when omitted (backward compatible 3-arg call)", () => {
      expect(computeTotalCents(1000, 100, 0)).toBe(900);
    });
    it("clamps to 0 when promo + extension discount exceed subtotal", () => {
      // subtotal 500, promo 300, delivery 0, extension 400 → 500-300-400 = -200 → 0
      expect(computeTotalCents(500, 300, 0, 400)).toBe(0);
    });
    it("treats falsy extensionDiscountCents as 0", () => {
      expect(computeTotalCents(1000, 0, 0, undefined)).toBe(1000);
    });
  });

  describe("buildPromoRequestBody", () => {
    it("re-applies with gateway field `promoCode`", () => {
      expect(buildPromoRequestBody("SALE10")).toEqual({ promoCode: "SALE10" });
    });
  });

  describe("extractPromoErrorMessage", () => {
    it("returns backend message for an expired promo", () => {
      expect(extractPromoErrorMessage({ message: "Промокод истёк" })).toBe(
        "Промокод истёк",
      );
    });
    it("falls back to the abort message", () => {
      expect(extractPromoErrorMessage({})).toBe(
        "Промокод больше недействителен — обновите заказ",
      );
      expect(extractPromoErrorMessage(null)).toBe(
        "Промокод больше недействителен — обновите заказ",
      );
    });
    it("reads json.error when message absent", () => {
      expect(extractPromoErrorMessage({ error: "cart_not_found" })).toBe(
        "cart_not_found",
      );
    });
  });
});
