import { defineSection, type Ctx, type El, type Money, type Order, type OrderLine, type OrderSummary } from '@merfy/shell';

// «Заказы» по страницам кабинета прода (flux): список («Заказ №…», «от …», статус, «Перейти») и заказ по ?n= —
// подзаголовок с e-mail (ctx.customer), мета «N товаров · от …», колонки товаров и данных; отмена с причиной —
// окно behavior dialog, после успеха — обновлённый заказ и «Заказ отменён» (прод перезагружает страницу, но в SDK
// окно не владеет адресом страницы). Данные — ctx.orders с quiet: true, отказы — текст рядом (список) или вместо
// заказа; гостья на страницы кабинета не попадает — её уводит каркас (leavePrivatePage).

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

// «2 товара · от 20.10.26» — склонение и дата как у страницы заказа прода.
function metaText(order: Order): string {
  const count = order.lines.length;
  const last = count % 100;
  const digit = count % 10;
  let word = 'товаров';
  if (!(last >= 11 && last <= 19)) {
    if (digit === 1) word = 'товар';
    else if (digit >= 2 && digit <= 4) word = 'товара';
  }
  const date = new Date(order.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
  return `${count} ${word} · от ${date}`;
}

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
  row.ref('quantity')?.text(`${line.quantity} шт.`);
  row.ref('total')?.text(line.gift ? 'Подарок' : priceOf(line.total));
}

// Заказ: подзаголовок, мета, строки, адрес (нет — ячейки нет), «Отменить заказ» — при canCancel.
function showOrder(order: Order, ctx: Ctx<Record<string, unknown>, 'orders'>): void {
  ctx.ref('order-error')?.hide();
  ctx.ref('order-body')?.show();
  ctx.ref('order-subtitle')?.text(`Заказ №${order.number}`);
  ctx.ref('order-meta')?.text(metaText(order));
  ctx.ref('order-number')?.text(order.number);
  ctx.ref('order-status')?.text(order.statusText);
  ctx.ref('address-row')?.toggle(order.address !== null);
  ctx.ref('order-address')?.text(order.address ?? '');
  ctx.ref('order-total')?.text(order.total === null ? '' : priceOf(order.total));
  ctx.ref('lines')?.list(order.lines, fillLine);
  clearNotice(ctx.ref('cancel-error'));
  ctx.ref('cancel-success')?.hide();
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

// Отмена: пустая причина — текст без запроса; успех — заказ из ответа на страницу (статус, кнопки нет)
// и «Заказ отменён» в окне. Прод перезагружает страницу, но в SDK адресом страницы окна не владеет:
// данные после отмены те же, что при перезагрузке.
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
  ctx.ref('cancel-success')?.show();
}

export default defineSection({
  mount(_el, ctx) {
    if (ctx.mode === 'preview') {
      ctx.ref('loading')?.hide();
      ctx.ref('empty')?.show();
      return;
    }
    ctx.watch(ctx.customer.$customer, (state) => {
      ctx.ref('email')?.text(state.ready && state.customer !== null ? state.customer.email : '');
    });
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
    'cancel-confirm'(_target, ctx) {
      const number = ctx.ref('order-number')?.text() ?? '';
      void cancelOrder(number, ctx);
    },
  },
});
