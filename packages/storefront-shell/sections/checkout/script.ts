import {
  defineSection,
  type CartLine,
  type CheckoutDelivery,
  type CheckoutErrorKey,
  type CheckoutField,
  type CheckoutForm,
  type CheckoutSettings,
  type Ctx,
  type El,
  type Money,
} from '@merfy/shell';

// «Оформление заказа» (базовые секции, 03.11): форма и сводка рисуют сторы ctx.checkout — поля, ошибки, подсказки
// адреса, способы доставки и оплаты, промокод, итоги; запросы делает модуль. Поле пишет checkout.set, уход с поля —
// checkout.leave, выборы — действия SDK в разметке, «Оплатить» — checkout.submit.

type C = Ctx<Record<string, unknown>, 'checkout' | 'customer'>;

const FIELDS: readonly CheckoutField[] = [
  'email',
  'phone',
  'country',
  'firstName',
  'lastName',
  'city',
  'address',
  'postalCode',
];
const ERRORS: readonly CheckoutErrorKey[] = [
  'email',
  'phone',
  'country',
  'firstName',
  'lastName',
  'city',
  'address',
  'postalCode',
  'delivery',
  'point',
  'payment',
];

// Деньги — копейки целым числом; на витрине — рубли без копеек, знак рубля после числа.
const priceOf = (money: Money): string =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: money.currency, maximumFractionDigits: 0 }).format(
    money.amount / 100,
  );

// Доставка в итогах: способ не выбран — прочерк, 0 — «Бесплатно».
const shippingText = (money: Money | null): string => {
  if (money === null) return '—';
  return money.amount === 0 ? 'Бесплатно' : priceOf(money);
};

const fieldOf = (target: El): CheckoutField | null => FIELDS.find((field) => field === target.attr('name')) ?? null;

// Какие поля есть: телефон, имя и фамилия по режиму магазина, адрес и доставка — для физической доставки.
function applySettings(ctx: C, settings: CheckoutSettings): void {
  ctx.ref('phone')?.toggle(settings.phone);
  ctx.ref('first-name')?.toggle(settings.name !== 'surname');
  ctx.ref('last-name')?.toggle(settings.name !== 'name');
  ctx.ref('country')?.toggle(settings.address);
  ctx.ref('address-fields')?.toggle(settings.address);
  ctx.ref('delivery')?.toggle(settings.address);
  ctx.ref('promo')?.toggle(!settings.offer);
  // E-mail предложения задал продавец — поле только для чтения (readonly код секции не пишет, disabled — можно).
  ctx.ref('field-email')?.attr('disabled', settings.offer ? '' : null);
}

// Значения — в поля, только если отличаются (телефон модуль приводит к виду +7 (…)); ошибки — под полями.
function applyForm(ctx: C, form: CheckoutForm): void {
  FIELDS.forEach((field) => {
    const input = ctx.ref(`field-${field}`);
    if (input !== null && input.value() !== form.values[field]) input.value(form.values[field]);
  });
  ERRORS.forEach((key) => {
    const text = form.errors[key];
    const error = ctx.ref(`error-${key}`);
    error?.text(text ?? '');
    error?.toggle(text !== undefined);
    ctx.ref(`field-${key}`)?.attr('aria-invalid', text === undefined ? null : 'true');
  });
}

const fillLine = (row: El, line: CartLine): void => {
  const image = row.ref('image');
  if (line.image === null) image?.hide();
  else image?.attr('src', line.image);
  row.ref('quantity')?.text(line.quantity);
  row.ref('title')?.text(line.title);
  row.ref('options')?.text(
    Object.entries(line.options)
      .map(([name, value]) => `${name}: ${value}`)
      .join(', '),
  );
  row.ref('price')?.text(line.gift ? 'Подарок' : priceOf(line.total));
};

const DELIVERY_TEXT: Readonly<Record<CheckoutDelivery['status'], string>> = {
  idle: 'Заполните адрес доставки, чтобы увидеть варианты',
  loading: 'Считаем варианты доставки…',
  ready: '',
  error: '',
  none: '',
};

function applyDelivery(ctx: C, delivery: CheckoutDelivery): void {
  const status = ctx.ref('delivery-status');
  const text = delivery.status === 'error' ? (delivery.message ?? '') : DELIVERY_TEXT[delivery.status];
  status?.text(text);
  status?.toggle(text !== '');
  const options = ctx.ref('delivery-options');
  options?.toggle(delivery.options.length > 0);
  // Строка списка — сама кнопка способа (корень <template>): атрибуты — у строки.
  options?.list(delivery.options, (row, option) => {
    row.attr('data-option-id', option.id);
    row.attr('aria-checked', option.id === delivery.selected ? 'true' : 'false');
    row.ref('option-title')?.text(option.title);
    row.ref('option-about')?.text(option.about);
    row.ref('option-cheapest')?.toggle(option.cheapest);
    row.ref('option-price')?.text(option.price.amount === 0 ? 'Бесплатно' : priceOf(option.price));
  });
  applyPoints(ctx, delivery);
}

const POINTS_TEXT = {
  idle: '',
  loading: 'Ищем пункты выдачи…',
  error: 'Не удалось загрузить пункты выдачи',
  ready: '',
};

function applyPoints(ctx: C, delivery: CheckoutDelivery): void {
  const option = delivery.options.find((candidate) => candidate.id === delivery.selected);
  const { points } = delivery;
  ctx.ref('points')?.toggle(option?.needsPoint === true);
  const empty = points.status === 'ready' && points.items.length === 0 ? 'В этом городе пунктов выдачи нет' : '';
  const text = POINTS_TEXT[points.status] || empty;
  ctx.ref('points-status')?.text(text);
  ctx.ref('points-status')?.toggle(text !== '');
  ctx.ref('points-list')?.list(points.items, (row, point) => {
    row.attr('data-point-code', point.code);
    row.attr('aria-checked', point.code === points.selected ? 'true' : 'false');
    row.ref('point-address')?.text(point.name === '' ? point.address : `${point.name} · ${point.address}`);
    row.ref('point-hours')?.text(point.hours);
  });
}

function watchSummary(ctx: C): void {
  ctx.watch(ctx.checkout.$lines, (state) => {
    ctx.ref('lines-empty')?.toggle(state.ready && state.lines.length === 0);
    ctx.ref('lines')?.list(state.lines, fillLine);
  });
  ctx.watch(ctx.checkout.$totals, (totals) => {
    const discount = totals.discount.amount + totals.extensionDiscount.amount;
    ctx.ref('discount-row')?.toggle(discount > 0);
    ctx.ref('discount-name')?.text(totals.discountName ?? 'Скидка');
    ctx.ref('discount')?.text(`−${priceOf({ amount: discount, currency: totals.total.currency })}`);
    ctx.ref('shipping')?.text(shippingText(totals.delivery));
    ctx.ref('total')?.text(totals.ready ? priceOf(totals.total) : '—');
    ctx.ref('pay-text')?.text(totals.ready ? `Оплатить ${priceOf(totals.total)}` : 'Оплатить');
  });
  ctx.watch(ctx.checkout.$promo, (promo) => {
    ctx.ref('promo-form')?.toggle(promo.code === null);
    ctx.ref('promo-applied')?.toggle(promo.code !== null);
    ctx.ref('promo-name')?.text(promo.code ?? '');
    ctx.ref('promo-error')?.text(promo.error ?? '');
    ctx.ref('promo-error')?.toggle(promo.error !== null);
    ctx.ref('promo-apply')?.attr('disabled', promo.busy ? '' : null);
  });
}

function watchChoices(ctx: C): void {
  ctx.watch(ctx.checkout.$delivery, (delivery) => applyDelivery(ctx, delivery));
  ctx.watch(ctx.checkout.$payment, (payment) => {
    ctx.ref('payment-methods')?.list(payment.methods, (row, method) => {
      row.attr('data-method', method.key);
      row.attr('aria-checked', method.key === payment.selected ? 'true' : 'false');
      row.ref('method-title')?.text(method.title);
    });
    ctx.ref('payment-unavailable')?.toggle(payment.unavailable);
  });
  ctx.watch(ctx.checkout.$hints, (hints) => {
    (['city', 'address'] as const).forEach((field) => {
      const list = ctx.ref(`hints-${field}`);
      const items = hints.field === field ? hints.items : [];
      list?.toggle(items.length > 0);
      list?.list(items, (row, hint) => {
        row.ref('hint')?.attr('data-hint-id', hint.id);
        row.ref('hint')?.text(hint.text);
      });
    });
  });
}

function watchStatus(ctx: C): void {
  ctx.watch(ctx.checkout.$status, (status) => {
    ctx.ref('submit-error')?.text(status.error ?? '');
    ctx.ref('submit-error')?.toggle(status.error !== null);
    ctx.ref('sign-in-note')?.toggle(status.signIn);
    ctx.ref('pay')?.attr('aria-busy', status.submitting ? 'true' : null);
    ctx.ref('pay-loading')?.toggle(status.submitting);
  });
  ctx.watch(ctx.customer.$customer, (state) => ctx.ref('sign-in')?.toggle(state.ready && state.customer === null));
}

// После «Оплатить» с ошибками — фокус на первое поле с ошибкой.
function focusFirstError(ctx: C): void {
  const errors = ctx.checkout.$form.get().errors;
  const field = FIELDS.find((name) => errors[name] !== undefined);
  if (field !== undefined) ctx.ref(`field-${field}`)?.focus();
}

export default defineSection({
  mount(_el, ctx) {
    ctx.watch(ctx.checkout.$settings, (settings) => applySettings(ctx, settings));
    ctx.watch(ctx.checkout.$form, (form) => applyForm(ctx, form));
    watchChoices(ctx);
    watchSummary(ctx);
    watchStatus(ctx);
  },
  actions: {
    field(target, ctx) {
      const field = fieldOf(target);
      if (field !== null) ctx.checkout.set({ field, value: target.value() });
    },
    leave(target, ctx) {
      const field = fieldOf(target);
      if (field !== null) ctx.checkout.leave({ field });
    },
    async promo(_target, ctx) {
      await ctx.checkout.applyPromo({ code: ctx.ref('promo-code')?.value() ?? '' }, { quiet: true });
    },
    async pay(_target, ctx) {
      const result = await ctx.checkout.submit();
      if (!result.ok && result.error.code === 'invalid') focusFirstError(ctx);
    },
  },
});
