import { defineSection, type El } from '@merfy/shell';

// «Каталог»: сердечко на карточке отмечено, если товар в «Избранном» (aria-pressed), а «−» и «+» быстрого добавления
// «Количество» меняют число и data-quantity кнопки «В корзину» своей карточки (cart.add берёт штуки из него).
// Отметка и добавление — действия SDK favorites.toggle и cart.add в разметке; скрипту остаётся только вид по состоянию.

const QUANTITY_MIN = 1;
const QUANTITY_MAX = 99;

function markHearts(hearts: readonly El[], ids: readonly string[]): void {
  for (const heart of hearts) heart.attr('aria-pressed', String(ids.includes(heart.attr('data-product-id') ?? '')));
}

function changeQuantity(button: El, step: number): void {
  const card = button.closest('card');
  if (card === null) return;
  const shown = Number(card.ref('quantity')?.text() ?? QUANTITY_MIN);
  const current = Number.isInteger(shown) ? shown : QUANTITY_MIN;
  const next = Math.min(QUANTITY_MAX, Math.max(QUANTITY_MIN, current + step));
  card.ref('quantity')?.text(next);
  card.ref('buy')?.attr('data-quantity', String(next));
  card.ref('less')?.attr('disabled', next <= QUANTITY_MIN ? '' : null);
  card.ref('more')?.attr('disabled', next >= QUANTITY_MAX ? '' : null);
}

export default defineSection({
  actions: {
    less(button) {
      changeQuantity(button, -1);
    },
    more(button) {
      changeQuantity(button, 1);
    },
  },
  mount(_el, ctx) {
    ctx.watch(ctx.favorites.$favorites, (state) => markHearts(ctx.refs('heart'), state.ids));
  },
});
