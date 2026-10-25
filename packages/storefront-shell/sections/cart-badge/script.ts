import { defineSection } from '@merfy/shell';

// Значок корзины (design.md блока 5, раздел 3.13): число штук в корзине — ctx.watch(ctx.cart.$count); подписку
// снимает ядро, когда элемент ушёл из документа. При 0 числа не видно (блок 9, 9.5; часть 9б).
export default defineSection({
  mount(_el, ctx) {
    ctx.watch(ctx.cart.$count, (count) => {
      const badge = ctx.ref('count');
      badge?.text(count);
      badge?.toggle(count > 0);
    });
  },
});
