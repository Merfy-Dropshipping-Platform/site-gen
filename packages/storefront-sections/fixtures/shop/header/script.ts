import { defineSection } from '@merfy/shell';

// «Шапка» (блок 10 «Секций и SDK», 10.9, «Решил сам» п. 21; часть 10а, Р10а-12): число штук в корзине у ссылки /cart —
// ctx.watch(ctx.cart.$count) у каждого data-ref="cart-count"; переход по ссылке — cart.open в разметке. Избранное и
// адрес кабинета — части 10б и 10в.
export default defineSection({
  mount(_el, ctx) {
    ctx.watch(ctx.cart.$count, (count) => {
      for (const badge of ctx.refs('cart-count')) {
        badge.text(count);
        badge.toggle(count > 0);
      }
    });
  },
});
