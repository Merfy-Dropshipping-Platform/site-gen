import { defineSection, type Money } from '@merfy/shell';

// «Промежуточный итог» (блок 10 «Секций и SDK», 10.4, «Решил сам» п. 7; часть 10а, Р10а-11): суммы — ctx.cart.$totals;
// кнопка «Оформить заказ» — только когда в корзине есть строка без подарка (п. 9), иначе cart.checkout откажет. Итог
// целиком — только когда корзина загружена и в ней есть строки, как строки в «Корзине»: у пустой корзины «Сумма 0 ₽» не
// показывается. Минимальная сумма заказа: не хватает — под итогом «До минимальной суммы заказа осталось N ₽», а кнопка
// неактивна (aria-disabled и вне табуляции; сервер откажет оформить и в обход кнопки).

// Деньги — копейки целым числом; на витрине — рубли без копеек, знак рубля после числа.
const priceOf = (money: Money): string =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: money.currency, maximumFractionDigits: 0 }).format(
    money.amount / 100,
  );

export default defineSection({
  mount(_el, ctx) {
    ctx.watch(ctx.cart.$totals, (totals) => {
      ctx.ref('discount')?.toggle(totals.discount.amount > 0);
      ctx.ref('discount-name')?.text(totals.discountName === null ? 'Скидка' : `Скидка «${totals.discountName}»`);
      ctx.ref('discount-value')?.text(`−${priceOf(totals.discount)}`);
      ctx.ref('total')?.text(priceOf(totals.total));
      // Минимальная сумма заказа магазина: не хватает — «осталось N ₽» и кнопка неактивна (ссылка без действия).
      const short = totals.minOrderRemaining.amount > 0;
      const note = ctx.ref('min-order');
      note?.text(`До минимальной суммы заказа осталось ${priceOf(totals.minOrderRemaining)}`);
      note?.toggle(short);
      const checkout = ctx.ref('checkout');
      checkout?.attr('aria-disabled', short ? 'true' : null);
      checkout?.attr('tabindex', short ? '-1' : null); // с клавиатуры не нажать; сервер откажет и при обходе
    });
    ctx.watch(ctx.cart.$cart, (cart) => {
      const sold = cart.lines.some((line) => !line.gift);
      ctx.ref('summary')?.toggle(cart.ready && cart.lines.length > 0);
      ctx.ref('checkout')?.toggle(cart.ready && sold);
    });
  },
});
