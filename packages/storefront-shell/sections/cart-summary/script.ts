import { defineSection, type Money } from '@merfy/shell';

// «Промежуточный итог» (блок 10 «Секций и SDK», 10.4, «Решил сам» п. 7; часть 10а, Р10а-11): суммы — ctx.cart.$totals;
// кнопка «Оформить заказ» — только когда в корзине есть строка без подарка (п. 9), иначе cart.checkout откажет. Итог
// целиком — только когда корзина загружена и в ней есть строки, как строки в «Корзине»: у пустой корзины «Сумма 0 ₽» не
// показывается.

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
    });
    ctx.watch(ctx.cart.$cart, (cart) => {
      const sold = cart.lines.some((line) => !line.gift);
      ctx.ref('summary')?.toggle(cart.ready && cart.lines.length > 0);
      ctx.ref('checkout')?.toggle(cart.ready && sold);
    });
  },
});
