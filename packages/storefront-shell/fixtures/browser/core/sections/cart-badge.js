// Значок корзины в новом виде (design.md блока 5, раздел 3.13): число штук — ctx.watch(ctx.cart.$count).
export default {
  mount(_el, ctx) {
    ctx.watch(ctx.cart.$count, (count) => ctx.ref('count')?.text(count));
  },
};
