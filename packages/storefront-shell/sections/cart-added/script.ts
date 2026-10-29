import { defineSection, type CartLine, type Ctx, type Money } from '@merfy/shell';

// Окно «Товар добавлен в корзину» (блок 10 «Секций и SDK», 10.3, «Решил сам» п. 6; часть 10а, Р10а-11): открывает
// поведение dialog по open-on="cart-add"; скрипт заполняет строку по lineId из события и число штук из $count. Цена до
// скидки приходит с чтением корзины (ответ добавления её не отдаёт), поэтому строка перезаполняется и при каждой смене
// $cart, пока она показана.

// Деньги — копейки целым числом; на витрине — рубли без копеек, знак рубля после числа.
const priceOf = (money: Money): string =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: money.currency, maximumFractionDigits: 0 }).format(
    money.amount / 100,
  );

// Выбранный вариант — значения через запятую, как в окне на проде: «Синий, S». Вариантов нет — пусто.
const optionsText = (line: CartLine): string => Object.values(line.options).join(', ');

const fillImage = (ctx: Ctx, line: CartLine): void => {
  const image = ctx.ref('image');
  if (line.image === null) image?.hide();
  else {
    image?.attr('src', line.image);
    image?.show();
  }
};

const fillLine = (ctx: Ctx, line: CartLine): void => {
  fillImage(ctx, line);
  ctx.ref('title')?.text(line.title);
  const options = optionsText(line);
  ctx.ref('options')?.text(options);
  ctx.ref('options')?.toggle(options !== '');
  ctx.ref('price')?.text(priceOf(line.price));
  ctx.ref('compare')?.text(line.compareAt === null ? '' : priceOf(line.compareAt));
  ctx.ref('compare')?.toggle(line.compareAt !== null);
};

export default defineSection({
  mount(_el, ctx) {
    let shown: string | null = null;
    const refill = (): void => {
      const line = ctx.cart.$cart.get().lines.find((item) => item.id === shown);
      if (line !== undefined) fillLine(ctx, line);
    };
    ctx.listen('merfy:cart:add', (detail) => {
      shown = detail.lineId;
      refill();
    });
    ctx.watch(ctx.cart.$cart, refill);
    ctx.watch(ctx.cart.$count, (count) => {
      ctx.ref('count')?.text(count);
    });
  },
});
