import { defineSection, type CheckoutOrder, type Ctx, type El, type Money, type OrderLine } from '@merfy/shell';

// «Спасибо за заказ» (базовые секции, 03.11): заказ — ctx.checkout.$order (сводку читает модуль: ?orderId= адреса или
// последний оформленный; пока оплата идёт — перечитывает). Приветствие — шаблон параметра с {name}, состояние оплаты —
// заголовок подтверждения: прошла — тексты параметров, идёт или не прошла — тексты пяти тем.

type C = Ctx<Record<string, unknown>, 'checkout'>;

const priceOf = (money: Money): string =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: money.currency, maximumFractionDigits: 0 }).format(
    money.amount / 100,
  );

const textSetting = (ctx: C, id: string): string => {
  const value = ctx.settings[id];
  return typeof value === 'string' ? value : '';
};

// «Спасибо за заказ, {name}!»: есть имя — подставить; нет — «, {name}» убрать.
const greetingOf = (template: string, name: string): string =>
  name === '' ? template.replace(/[\s,]*\{name\}/, '') : template.replace('{name}', name);

const PAYMENT_TEXT = {
  pending: { title: 'Оплата обрабатывается', text: 'Мы подтвердим заказ, как только платёж пройдёт.' },
  failed: { title: 'Оплата не прошла', text: 'Заказ не оплачен. Попробуйте оформить снова.' },
};

const fillLine = (row: El, line: OrderLine): void => {
  const image = row.ref('image');
  if (line.image === null) image?.hide();
  else image?.attr('src', line.image);
  row.ref('quantity')?.text(line.quantity);
  row.ref('title')?.text(line.title);
  row.ref('options')?.text(Object.values(line.options).join(' · '));
  row.ref('price')?.text(line.gift ? 'Подарок' : priceOf(line.total));
};

function fillHead(ctx: C, order: CheckoutOrder): void {
  ctx.ref('number')?.text(`Заказ #${order.number}`);
  ctx.ref('greeting')?.text(greetingOf(textSetting(ctx, 'heading'), order.name));
  const payment = order.payment === 'paid' ? null : PAYMENT_TEXT[order.payment];
  ctx.ref('confirmed-title')?.text(payment?.title ?? textSetting(ctx, 'subheading'));
  ctx.ref('confirmed-text')?.text(payment?.text ?? textSetting(ctx, 'text'));
  ctx.ref('contacts')?.text(order.contacts.join('\n') || '—');
  ctx.ref('delivery')?.text(order.delivery || '—');
  ctx.ref('address')?.text(order.address || '—');
}

function fillTotals(ctx: C, order: CheckoutOrder): void {
  ctx.ref('lines')?.list(order.lines, fillLine);
  ctx.ref('subtotal')?.text(priceOf(order.subtotal));
  ctx.ref('discount-row')?.toggle(order.discount.amount > 0);
  ctx.ref('discount')?.text(`−${priceOf(order.discount)}`);
  ctx.ref('shipping')?.text(order.shipping.amount === 0 ? 'Бесплатно' : priceOf(order.shipping));
  ctx.ref('total')?.text(priceOf(order.total));
}

// Названия документов в юридической строке → ссылки на заполненные политики (как legal-links пяти тем): «Условиями
// обслуживания» — условия, «Политикой конфиденциальности» и «… файлов cookie» — конфиденциальность.
const LEGAL_PHRASES = [
  { phrase: 'Условиями обслуживания', policy: 'tos' },
  { phrase: 'Политикой конфиденциальности', policy: 'privacy' },
  { phrase: 'Политикой использования файлов cookie', policy: 'privacy' },
];

interface LegalPart {
  readonly text: string;
  readonly url: string | null;
}

// Разбивка по названиям документов (тот же список, что в LEGAL_PHRASES): части с названием — ссылки.
function legalParts(text: string, urlOf: (policy: string) => string | null): LegalPart[] {
  return text
    .split(/(Условиями обслуживания|Политикой конфиденциальности|Политикой использования файлов cookie)/)
    .filter((part) => part !== '')
    .map((part) => {
      const found = LEGAL_PHRASES.find((item) => item.phrase === part);
      return { text: part, url: found === undefined ? null : urlOf(found.policy) };
    });
}

function linkLegal(ctx: C): void {
  const legal = ctx.ref('legal');
  if (legal === null) return;
  const parts = legalParts(textSetting(ctx, 'legal-text'), (policy) => legal.attr(`data-${policy}`));
  if (parts.every((part) => part.url === null)) return;
  ctx.ref('legal-static')?.hide();
  legal.list(parts, (row, part) => {
    const link = row.ref('legal-link');
    link?.toggle(part.url !== null);
    link?.attr('href', part.url);
    link?.text(part.text);
    row.ref('legal-part')?.toggle(part.url === null);
    row.ref('legal-part')?.text(part.text);
  });
}

function showMissing(ctx: C, status: CheckoutOrder['status']): void {
  ctx.ref('content')?.hide();
  ctx.ref('missing')?.show();
  if (status !== 'error') return;
  ctx.ref('missing-title')?.text('Не удалось загрузить заказ');
  ctx.ref('missing-text')?.text('Попробуйте обновить страницу.');
}

export default defineSection({
  mount(_el, ctx) {
    linkLegal(ctx);
    ctx.watch(ctx.checkout.$order, (order) => {
      if (order.status === 'loading') return;
      if (order.status !== 'ready') return showMissing(ctx, order.status);
      ctx.ref('missing')?.hide();
      ctx.ref('content')?.show();
      fillHead(ctx, order);
      fillTotals(ctx, order);
    });
  },
});
