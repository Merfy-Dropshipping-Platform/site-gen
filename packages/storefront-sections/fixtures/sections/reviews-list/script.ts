import { defineSection } from '@merfy/shell';

// Отзывы (секция расширения reviews): «Купить такой же» кладёт товар в корзину — значок корзины это видит.
export default defineSection({
  actions: {
    async buy(button, ctx) {
      const productId = button.attr('data-buy');
      if (productId !== null) await ctx.cart.add({ productId });
    },
  },
});
