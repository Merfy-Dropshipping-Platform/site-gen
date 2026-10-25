import { defineSection } from '@merfy/shell';

// «Шапка» (блок 10 «Секций и SDK», 10.9, «Решил сам» п. 21; часть 10а, Р10а-12): число штук в корзине у ссылки /cart —
// ctx.watch(ctx.cart.$count) у каждого data-ref="cart-count"; переход по ссылке — cart.open в разметке. Число
// отмеченных у «Избранного» — так же (часть 10б, Р10б-13); адрес «Профиля» — по входу (часть 10в, Р10в-14).
export default defineSection({
  mount(_el, ctx) {
    ctx.watch(ctx.cart.$count, (count) => {
      for (const badge of ctx.refs('cart-count')) {
        badge.text(count);
        badge.toggle(count > 0);
      }
    });
    ctx.watch(ctx.favorites.$count, (count) => {
      for (const badge of ctx.refs('favorites-count')) {
        badge.text(count);
        badge.toggle(count > 0);
      }
    });
    // Вход читается при первой подписке ($customer): подписываемся после первого прохода страницы, чтобы чтение me
    // не шло раньше готовности страницы; до ответа me ссылка ведёт на «Вход», как в HTML.
    ctx.after(0, () => {
      ctx.watch(ctx.auth.$customer, (state) => {
        const href = state.customer === null ? '/login' : '/account';
        for (const profile of ctx.refs('profile')) profile.attr('href', href);
      });
    });
  },
});
