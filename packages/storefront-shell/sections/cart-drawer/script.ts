import { defineSection, type CartLine, type Ctx, type El, type Money } from '@merfy/shell';

// «Корзина-панель» (блок 10 «Секций и SDK», 10.2, «Решил сам» п. 8; часть 10а, Р10а-11): окно открывает поведение
// dialog по open-on="cart-open"; строки — ответ шлюза через El.list по <template>, итог — ctx.cart.$totals. Низ с
// «Итого» и «Оформить заказ» — только когда в корзине есть строки, как «Промежуточный итог» на странице корзины.
//
// Панель закрыта, пока покупатель не нажал на корзину, — заполнять её при загрузке страницы незачем (19.11, Web Vitals:
// запуск панели держал страницу 70–110 мс на телефоне — Intl.NumberFormat с валютой создавался при запуске, а панели
// никто не видит). Поэтому до первого открытия (merfy:cart:open) подписки ничего не рисуют, а при открытии панель
// заполняется текущими значениями стора — до первого кадра панели. Подписки остаются с самого начала: подписка на
// $totals — то, что просит ядро перечитывать итоги после каждого «В корзину», иначе первое открытие показало бы итог
// до последнего добавления. Число штук в шапке и значке корзины считают их секции, от панели оно не зависит.

// Деньги — копейки целым числом; на витрине — рубли без копеек, знак рубля после числа. Форматтер Intl дорог на создании,
// поэтому на валюту он один — в замыкании экземпляра (на уровне файла секции только объявления).
type PriceOf = (money: Money) => string;
const pricesOf = (): PriceOf => {
  const formats = new Map<string, Intl.NumberFormat>();
  return (money) => {
    const format =
      formats.get(money.currency) ??
      new Intl.NumberFormat('ru-RU', { style: 'currency', currency: money.currency, maximumFractionDigits: 0 });
    formats.set(money.currency, format);
    return format.format(money.amount / 100);
  };
};

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

const fillRow =
  (priceOf: PriceOf) =>
  (row: El, line: CartLine): void => {
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

const drawLines = (ctx: Ctx, priceOf: PriceOf): void => {
  const cart = ctx.cart.$cart.get();
  if (!cart.ready) return;
  const empty = ctx.ref('empty');
  const lines = ctx.ref('lines');
  const hasLines = cart.lines.length > 0;
  empty?.toggle(!hasLines);
  lines?.toggle(hasLines);
  ctx.ref('summary')?.toggle(hasLines);
  if (hasLines) lines?.list(cart.lines, fillRow(priceOf));
};

const drawTotals = (ctx: Ctx, priceOf: PriceOf): void => {
  const totals = ctx.cart.$totals.get();
  // У строк и у «Итого» один data-ref="total": итог — последний в порядке шаблона.
  const totalRefs = ctx.refs('total');
  totalRefs.at(-1)?.text(priceOf(totals.total));
  // Минимальная сумма заказа магазина: не хватает — «осталось N ₽», кнопка оформления неактивна.
  const short = totals.minOrderRemaining.amount > 0;
  const note = ctx.ref('min-order');
  note?.text(`До минимальной суммы заказа осталось ${priceOf(totals.minOrderRemaining)}`);
  note?.toggle(short);
  const checkout = ctx.ref('checkout');
  checkout?.attr('aria-disabled', short ? 'true' : null);
  checkout?.attr('tabindex', short ? '-1' : null);
};

export default defineSection({
  mount(_el, ctx) {
    const priceOf = pricesOf();
    let opened = false;
    ctx.watch(ctx.cart.$cart, () => {
      if (opened) drawLines(ctx, priceOf);
    });
    ctx.watch(ctx.cart.$totals, () => {
      if (opened) drawTotals(ctx, priceOf);
    });
    ctx.listen('merfy:cart:open', () => {
      if (opened) return;
      opened = true;
      drawLines(ctx, priceOf);
      drawTotals(ctx, priceOf);
    });
  },
});
