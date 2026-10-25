import { defineSection, type Money } from '@merfy/shell';

// Окно «Товар добавлен в корзину» (блок 10 «Секций и SDK», 10.3, «Решил сам» п. 6; часть 10а, Р10а-11): открывает
// поведение dialog по open-on="cart-add"; скрипт заполняет строку по lineId из события и число штук из $count.

// Деньги — копейки целым числом; на витрине — рубли без копеек, знак рубля после числа.
const priceOf = (money: Money): string =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: money.currency, maximumFractionDigits: 0 }).format(
    money.amount / 100,
  );

export default defineSection({
  mount(_el, ctx) {
    ctx.listen('merfy:cart:add', (detail) => {
      const line = ctx.cart.$cart.get().lines.find((item) => item.id === detail.lineId) ?? null;
      const image = ctx.ref('image');
      if (line === null || line.image === null) image?.hide();
      else {
        image?.attr('src', line.image);
        image?.show();
      }
      ctx.ref('title')?.text(line?.title ?? '');
      ctx.ref('price')?.text(line === null ? '' : priceOf(line.price));
    });
    ctx.watch(ctx.cart.$count, (count) => {
      ctx.ref('count')?.text(count);
    });
  },
});
