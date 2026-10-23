import { defineSection } from '@merfy/shell';

// Значок корзины (design.md блока 5, раздел 3.13): число штук в корзине — ctx.watch(ctx.cart.$count); подписку
// снимает ядро, когда элемент ушёл из документа.
export default defineSection({
  mount(_el, ctx) {
    ctx.watch(ctx.cart.$count, (count) => ctx.ref('count')?.text(count));
  },
});
