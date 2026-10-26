import { defineSection, type Ctx, type El, type Money, type Order, type OrderLine, type OrderSummary } from '@merfy/shell';

// «Заказы» (блок 10 «Секций и SDK», 10.8, «Решил сам» п. 20; часть 10в, Р10в-13): список и заказ по ?n=, отмена с
// причиной; данные — ctx.orders с quiet: true, отказы — текст рядом (список) или вместо заказа.

const LIST_FAILED_TEXT = 'Не удалось загрузить заказы';
const REASON_EMPTY_TEXT = 'Укажите причину отмены';
const ORDER_URL = '/account/orders';

// Деньги — как у корзины 10а: копейки целым, рубли без копеек, знак рубля после числа.
const priceOf = (money: Money): string =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: money.currency, maximumFractionDigits: 0 }).format(
    money.amount / 100,
  );

// Варианты строки: «Цвет: Красный, Размер: M».
const optionsText = (line: OrderLine): string =>
  Object.entries(line.options)
    .map(([name, value]) => `${name}: ${value}`)
    .join(', ');

const notice = (message: string, target: El | null): void => {
  target?.text(message);
  target?.show();
};

const clearNotice = (target: El | null): void => {
  target?.text('');
  target?.hide();
};

// Строка списка: «Заказ №…», «от <дата>», статус, «Перейти» на заказ.
function fillSummary(row: El, order: OrderSummary): void {
  const date = new Date(order.createdAt).toLocaleDateString('ru-RU');
  row.ref('number')?.text(`Заказ №${order.number}`);
  row.ref('date')?.text(`от ${date}`);
  row.ref('status')?.text(order.statusText);
  row.ref('open')?.attr('href', `${ORDER_URL}?n=${encodeURIComponent(order.number)}`);
}

async function showList(ctx: Ctx<Record<string, unknown>, 'orders'>): Promise<void> {
  const result = await ctx.orders.list({ quiet: true });
  ctx.ref('loading')?.hide();
  if (!result.ok) {
    notice(LIST_FAILED_TEXT, ctx.ref('error'));
    return;
  }
  ctx.ref('orders')?.list(result.data.orders, fillSummary);
  ctx.ref('empty')?.toggle(result.data.orders.length === 0);
}

function fillLine(row: El, line: OrderLine): void {
  const image = row.ref('image');
  if (line.image === null) image?.hide();
  else {
    image?.attr('src', line.image);
    image?.show();
  }
  row.ref('title')?.text(line.title);
  row.ref('options')?.text(optionsText(line));
  row.ref('quantity')?.text(line.quantity);
  row.ref('total')?.text(line.gift ? 'Подарок' : priceOf(line.total));
}

// Заказ: ячейки, строки, адрес (нет — строки нет), «Отменить заказ» — при canCancel, форма отмены скрыта.
function showOrder(order: Order, ctx: Ctx<Record<string, unknown>, 'orders'>): void {
  ctx.ref('order-error')?.hide();
  ctx.ref('order-body')?.show();
  ctx.ref('order-number')?.text(order.number);
  ctx.ref('order-status')?.text(order.statusText);
  ctx.ref('address-row')?.toggle(order.address !== null);
  ctx.ref('order-address')?.text(order.address ?? '');
  ctx.ref('order-total')?.text(order.total === null ? '' : priceOf(order.total));
  ctx.ref('lines')?.list(order.lines, fillLine);
  ctx.ref('cancel-form')?.hide();
  clearNotice(ctx.ref('cancel-error'));
  ctx.ref('cancel-open')?.toggle(order.canCancel);
}

async function showOrderByNumber(number: string, ctx: Ctx<Record<string, unknown>, 'orders'>): Promise<void> {
  const result = await ctx.orders.get({ number }, { quiet: true });
  if (!result.ok) {
    notice(result.error.message, ctx.ref('order-error'));
    ctx.ref('order-body')?.hide();
    return;
  }
  showOrder(result.data.order, ctx);
}

// Отмена: пустая причина — текст без запроса; успех — заказ из ответа заново, форма скрыта.
async function cancelOrder(number: string, ctx: Ctx<Record<string, unknown>, 'orders'>): Promise<void> {
  const reason = ctx.ref('reason')?.value().trim() ?? '';
  if (reason === '') {
    notice(REASON_EMPTY_TEXT, ctx.ref('cancel-error'));
    return;
  }
  const result = await ctx.orders.cancel({ number, reason }, { quiet: true });
  if (!result.ok) {
    notice(result.error.message, ctx.ref('cancel-error'));
    return;
  }
  showOrder(result.data.order, ctx);
}

export default defineSection({
  mount(_el, ctx) {
    if (ctx.mode === 'preview') {
      ctx.ref('loading')?.hide();
      return;
    }
    const number = ctx.page.query.n;
    const ext = ctx.page.query.ext;
    // Заказ расширения (?ext=<id>, блок 12 «Секций и SDK»): список скрыт, страницу показывает часть records.
    if (typeof ext === 'string' && ext !== '') {
      ctx.ref('list-view')?.hide();
      return;
    }
    if (typeof number === 'string' && number !== '') {
      ctx.ref('list-view')?.hide();
      ctx.ref('order-view')?.show();
      void showOrderByNumber(number, ctx);
      return;
    }
    void showList(ctx);
  },
  actions: {
    'cancel-open'(_target, ctx) {
      ctx.ref('cancel-open')?.hide();
      clearNotice(ctx.ref('cancel-error'));
      ctx.ref('cancel-form')?.show();
    },
    'cancel-close'(_target, ctx) {
      ctx.ref('cancel-form')?.hide();
      clearNotice(ctx.ref('cancel-error'));
      ctx.ref('cancel-open')?.show();
    },
    'cancel-confirm'(_target, ctx) {
      const number = ctx.ref('order-number')?.text() ?? '';
      void cancelOrder(number, ctx);
    },
  },
});
