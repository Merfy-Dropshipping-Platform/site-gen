import { defineSection, type El } from '@merfy/shell';

// «Шапка»: число штук в корзине и отмеченных в «Избранном» — на значках (data-ref="cart-count", "favorites-count"),
// пустой счётчик скрыт; адрес «Профиля» — по входу. Переход в корзину — действие cart.open в разметке, поиск —
// search.open.

const showCount = (badges: El[], count: number): void => {
  for (const badge of badges) {
    badge.text(count);
    badge.toggle(count > 0);
  }
};

export default defineSection({
  mount(_el, ctx) {
    ctx.watch(ctx.cart.$count, (count) => showCount(ctx.refs('cart-count'), count));
    ctx.watch(ctx.favorites.$count, (count) => showCount(ctx.refs('favorites-count'), count));
    // Вход читается при первой подписке ($customer): подписываемся после первого прохода страницы, чтобы чтение me
    // не шло раньше готовности страницы; до ответа me ссылка ведёт на «Вход», как в HTML.
    ctx.after(0, () => {
      ctx.watch(ctx.customer.$customer, (state) => {
        const href = state.customer === null ? '/login' : '/account';
        for (const profile of ctx.refs('profile')) profile.attr('href', href);
      });
    });
  },
});
