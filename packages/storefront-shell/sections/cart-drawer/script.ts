import { defineSection, type CartLine, type El, type Money } from '@merfy/shell';

// «Корзина-панель» (блок 10 «Секций и SDK», 10.2, «Решил сам» п. 8; часть 10а, Р10а-11): окно открывает поведение
// dialog по open-on="cart-open"; строки — ответ шлюза через El.list по <template>, итог — ctx.cart.$totals.

// Деньги — копейки целым числом; на витрине — рубли без копеек, знак рубля после числа.
const priceOf = (money: Money): string =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: money.currency, maximumFractionDigits: 0 }).format(
    money.amount / 100,
  );

// Варианты строки: «Цвет: Красный, Размер: M».
const optionsText = (line: CartLine): string =>
  Object.entries(line.options)
    .map(([name, value]) => `${name}: ${value}`)
    .join(', ');

// Подарок по акции: без «−», «+» и «Удалить», цена — «Подарок».
const controlsOf = (row: El, line: CartLine): void => {
  const sold = !line.gift;
  const less = row.ref('less');
  const more = row.ref('more');
  const remove = row.ref('remove');
  less?.toggle(sold);
  more?.toggle(sold);
  remove?.toggle(sold);
  less?.attr('data-line-id', line.id);
  less?.attr('data-quantity', String(line.quantity - 1));
  more?.attr('data-line-id', line.id);
  more?.attr('data-quantity', String(line.quantity + 1));
  remove?.attr('data-line-id', line.id);
};

const fillRow = (row: El, line: CartLine): void => {
  const image = row.ref('image');
  if (line.image === null) image?.hide();
  else {
    image?.attr('src', line.image);
    image?.show();
  }
  row.ref('title')?.text(line.title);
  row.ref('options')?.text(optionsText(line));
  row.ref('price')?.text(line.gift ? 'Подарок' : priceOf(line.price));
  row.ref('quantity')?.text(line.quantity);
  row.ref('total')?.text(priceOf(line.total));
  controlsOf(row, line);
};

export default defineSection({
  mount(_el, ctx) {
    ctx.watch(ctx.cart.$cart, (cart) => {
      if (!cart.ready) return;
      const empty = ctx.ref('empty');
      const lines = ctx.ref('lines');
      const hasLines = cart.lines.length > 0;
      empty?.toggle(!hasLines);
      lines?.toggle(hasLines);
      if (hasLines) lines?.list(cart.lines, fillRow);
    });
    ctx.watch(ctx.cart.$totals, (totals) => {
      // У строк и у «Итого» один data-ref="total": итог — последний в порядке шаблона.
      const totalRefs = ctx.refs('total');
      totalRefs.at(-1)?.text(priceOf(totals.total));
    });
  },
});
