import { defineSection } from '@merfy/shell';

// Сломанная секция (блок 5 «Секций и SDK», часть 5в): опечатки в именах событий и действий.
export default defineSection({
  mount(_el, ctx) {
    ctx.listen('merfy:cart:ad', () => ctx.log('корзина'));
  },
  actions: {
    pick(button, ctx) {
      ctx.log(button.attr('data-coat') ?? '');
    },
  },
});
