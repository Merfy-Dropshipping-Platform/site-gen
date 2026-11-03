import { NO_PLACE, type HintField } from '../checkout-address';
import { cartIdNow, cityOf, loadPoints, recalculate, resolveCity, scheduleHints } from '../checkout-calc';
import { isCheckoutField, phoneText } from '../checkout-form';
import { OFFER_TOKEN, loadOffer, loadOrder, loadPayment, loadSettings } from '../checkout-load';
import { isPaymentMethod } from '../checkout-payment';
import {
  createAtoms,
  formStore,
  linesStore,
  statusStore,
  totalsStore,
  type CheckoutApi,
  type CheckoutRuntime,
} from '../checkout-state';
import {
  PROMO_KEY,
  blockedSubmit,
  forgetPromo,
  offerText,
  resultOf,
  submitCart,
  submitOffer,
  type Outcome,
} from '../checkout-submit';
import { type Reply } from '../failures';
import { requestJson } from '../requests';
import { onMount, readable } from '../stores';
import type {
  CheckoutDelivery,
  CheckoutField,
  CheckoutForm,
  CheckoutModule,
  CheckoutPayment,
  CheckoutPromo,
  CoreHandle,
  Result,
  SdkPart,
} from '../types';
import { cartRuntimeOf, queueRead } from './cart';

// Оформление заказа (базовые секции, 03.11): ctx.checkout. Все запросы оформления — здесь, секции рисуют сторы и зовут
// действия. Чтения — когда стор впервые читает секция: настройки формы и доставка — у формы, способы оплаты — у
// списка оплаты, сводка заказа — у «Спасибо за заказ». Повторного заказа нет: orders отдаёт тот же, пока он ждёт оплаты.

const invalid = <T>(message: string): Result<T> => ({ ok: false, error: { code: 'invalid', message } });
const fieldOf = (source: unknown, key: string): unknown =>
  typeof source === 'object' && source !== null ? Reflect.get(source, key) : undefined;

function apiOf(core: CoreHandle): CheckoutApi | null {
  const config = core.config;
  if (config === null) return null;
  return { url: config.api.url, shopId: config.shop.id, dadata: config.dadata?.token ?? null };
}

// Токен ссылки предложения из ?offer= — только на витрине.
function offerTokenOf(core: CoreHandle): string | null {
  if (core.mode !== 'live') return null;
  const token = new URLSearchParams(window.location.search).get('offer') ?? '';
  return OFFER_TOKEN.test(token) ? token : null;
}

// Промокод корзины — в sessionStorage до оплаты (тот же ключ, что у пяти тем): после перезагрузки он виден применённым.
function keepPromo(code: string | null): void {
  if (code === null) return forgetPromo();
  try {
    window.sessionStorage.setItem(PROMO_KEY, code);
  } catch {
    // sessionStorage закрыт браузером — промокод останется до перезагрузки страницы
  }
}

function savedPromo(): string | null {
  try {
    const code = window.sessionStorage.getItem(PROMO_KEY);
    return code === null || code === '' ? null : code;
  } catch {
    return null; // sessionStorage закрыт браузером — промокода не было
  }
}

function runtimeOf(core: CoreHandle): CheckoutRuntime {
  const cart = core.part('cart');
  const cartRt = cartRuntimeOf(cart) ?? null;
  const rt: CheckoutRuntime = {
    ...createAtoms(core, cart),
    core,
    api: apiOf(core),
    cart,
    cartRt,
    page: cartRt?.page ?? window.localStorage,
    offerToken: offerTokenOf(core),
    cards: new Map(),
    suggestions: [],
    hintTimer: null,
    calcRound: 0,
    calcKey: null,
  };
  const code = rt.offerToken === null && core.mode === 'live' ? savedPromo() : null;
  if (code !== null) rt.promo.set({ code, busy: false, error: null });
  return rt;
}

// Настройки или предложение — один раз; доставку считают после них.
function startOnce(rt: CheckoutRuntime): () => Promise<void> {
  let started: Promise<void> | null = null;
  const fail = (code: string): void => rt.sending.set({ submitting: false, error: offerText(code) });
  return () => (started ??= rt.offerToken === null ? loadSettings(rt) : loadOffer(rt, fail));
}

// Чтения по первой подписке: форма — настройки; доставка — настройки, расчёт и пересчёт при смене корзины.
function mountReads(rt: CheckoutRuntime): void {
  const settings = startOnce(rt);
  onMount(rt.settings, () => void settings());
  onMount(rt.payment, () => void loadPayment(rt));
  onMount(rt.order, () => void loadOrder(rt));
  onMount(rt.delivery, () => {
    void settings().then(() => recalculate(rt));
    return rt.cartState.listen(() => void recalculate(rt));
  });
}

// Поле «Город»: прежний город и разбор адреса больше не верны; пусто — расчёт без адреса.
function onCity(rt: CheckoutRuntime, value: string): void {
  rt.place.set(NO_PLACE);
  scheduleHints(rt, 'city', value);
  if (value.trim() === '') void recalculate(rt);
}

// Состояние модуля со сторами формы и итогов: их считают из атомов состояния.
type Built = CheckoutRuntime & {
  readonly form: ReturnType<typeof formStore>;
  readonly totals: ReturnType<typeof totalsStore>;
};

function setField(rt: Built, field: CheckoutField, raw: string): Result<CheckoutForm> {
  const value = field === 'phone' ? phoneText(raw) : raw;
  rt.values.set({ ...rt.values.get(), [field]: value });
  if (field === 'city') onCity(rt, value);
  if (field === 'address') {
    rt.place.set({ ...rt.place.get(), street: '', house: '', flat: '' });
    scheduleHints(rt, 'address', value);
  }
  return { ok: true, data: rt.form.get() };
}

// Ушёл с поля: его ошибка видна; город без подсказки — ФИАС по первой подсказке; подсказки закрыты.
function leaveField(rt: Built, field: CheckoutField): Result<CheckoutForm> {
  const marks = rt.marks.get();
  if (!marks.left.includes(field)) rt.marks.set({ ...marks, left: [...marks.left, field] });
  if (rt.hints.get().field === field) rt.hints.set({ field: null, items: [] });
  if (field === 'city') void resolveCity(rt);
  return { ok: true, data: rt.form.get() };
}

// Подсказка: город — ФИАС и пересчёт; адрес — улица, дом, квартира и индекс, город из подсказки, если не был выбран.
async function pickHint(rt: Built, id: string): Promise<Result<CheckoutForm>> {
  const field: HintField | null = rt.hints.get().field;
  const found = rt.suggestions[Number(id.slice(1)) - 1];
  if (field === null || found === undefined || !id.startsWith('h'))
    return invalid('checkout.pickHint: подсказки с этим id нет');
  rt.hints.set({ field: null, items: [] });
  const values = rt.values.get();
  const before = rt.place.get();
  const city = before.cityFiasId === '' ? cityOf(found.place) : cityOf(before);
  if (field === 'city') {
    rt.values.set({ ...values, city: found.text });
    rt.place.set({ ...NO_PLACE, ...cityOf(found.place) });
  } else {
    rt.values.set({
      ...values,
      address: found.text,
      city: values.city || found.place.cityName,
      postalCode: found.postalCode || values.postalCode,
    });
    rt.place.set({ ...found.place, ...city });
  }
  await recalculate(rt);
  return { ok: true, data: rt.form.get() };
}

function selectDelivery(rt: CheckoutRuntime, id: string): Result<CheckoutDelivery> {
  if (!rt.cards.has(id)) return invalid('checkout.selectDelivery: такого способа доставки нет в $delivery.options');
  rt.delivery.set({ ...rt.delivery.get(), selected: id, points: { status: 'idle', items: [], selected: null } });
  void loadPoints(rt);
  return { ok: true, data: rt.delivery.get() };
}

function selectPoint(rt: CheckoutRuntime, code: string): Result<CheckoutDelivery> {
  const delivery = rt.delivery.get();
  if (!delivery.points.items.some((point) => point.code === code))
    return invalid('checkout.selectPoint: такого пункта нет в $delivery.points');
  rt.delivery.set({ ...delivery, points: { ...delivery.points, selected: code } });
  return { ok: true, data: rt.delivery.get() };
}

function selectPayment(rt: CheckoutRuntime, method: unknown): Result<CheckoutPayment> {
  const payment = rt.payment.get();
  if (!isPaymentMethod(method) || !payment.methods.some((item) => item.key === method))
    return invalid('checkout.selectPayment: такого способа нет в $payment.methods');
  rt.payment.set({ ...payment, selected: method });
  return { ok: true, data: rt.payment.get() };
}

const promoText = (reply: Reply, fallback: string): string => {
  const message = fieldOf(reply.body, 'message');
  const first: unknown = Array.isArray(message) ? message[0] : message;
  return typeof first === 'string' && first !== '' ? first : fallback;
};

// Промокод на корзине: успех — итоги корзины перечитываются (скидку считает orders); отказ — текст магазина.
async function changePromo(rt: CheckoutRuntime, code: string | null): Promise<Result<CheckoutPromo>> {
  const cartId = cartIdNow(rt);
  if (rt.offerToken !== null || rt.api === null || cartId === null || rt.core.mode === 'preview')
    return invalid('checkout: промокод — только у корзины на витрине');
  rt.promo.set({ ...rt.promo.get(), busy: true, error: null });
  const url = `${rt.api.url}/orders/cart/${cartId}/promo`;
  const reply = await requestJson(
    url,
    code === null ? { method: 'DELETE' } : { method: 'POST', body: { promoCode: code } },
  );
  const ok = reply.status >= 200 && reply.status < 300;
  if (code !== null && !ok) {
    rt.promo.set({ code: null, busy: false, error: promoText(reply, 'Не удалось применить промокод') });
    return { ok: false, error: { code: 'refused', message: rt.promo.get().error ?? '' } };
  }
  rt.promo.set({ code, busy: false, error: null });
  keepPromo(code);
  if (rt.cartRt !== null) queueRead(rt.cartRt);
  return { ok: true, data: rt.promo.get() };
}

// «Оплатить»: пока идёт — повторное нажатие ничего не делает; ошибка — в $status.error.
async function submit(rt: Built): Promise<Result<{ readonly orderId: string }>> {
  if (rt.sending.get().submitting) return invalid('checkout.submit: заказ уже оформляется');
  const blocked = blockedSubmit(rt);
  if (blocked !== null) return finish(rt, blocked, errorOf(blocked));
  const method = rt.payment.get().selected ?? 'bank_card';
  // Итог — до отправки: после ухода на оплату номер корзины стёрт и её итоги пусты.
  const total = rt.totals.get().total;
  rt.sending.set({ submitting: true, error: null });
  const outcome = rt.offerToken === null ? await submitCart(rt, method) : await submitOffer(rt, method);
  if (outcome.ok && outcome.orderId !== '')
    rt.core.emit('merfy:checkout:order', { orderId: outcome.orderId, total, method });
  return finish(rt, outcome, errorOf(outcome));
}

// Текст под кнопкой: ошибки полей видны у полей, остальное — здесь.
function errorOf(outcome: Outcome): string | null {
  if (outcome.ok || outcome.code === 'invalid') return null;
  return outcome.text;
}

// Успех — кнопка остаётся в работе до ухода на платёжку; иначе — текст ошибки под кнопкой.
function finish(rt: CheckoutRuntime, outcome: Outcome, error: string | null): Result<{ readonly orderId: string }> {
  rt.sending.set({ submitting: outcome.ok, error });
  return resultOf(outcome);
}

const applyPromo = (rt: Built, code: string): Promise<Result<CheckoutPromo>> =>
  code === '' ? Promise.resolve(invalid('checkout.applyPromo: пустой промокод')) : changePromo(rt, code);

function moduleOf(
  rt: Built,
  status: ReturnType<typeof statusStore>,
  lines: ReturnType<typeof linesStore>,
): CheckoutModule {
  return {
    $form: readable(rt.form),
    $settings: readable(rt.settings),
    $hints: readable(rt.hints),
    $lines: readable(lines),
    $delivery: readable(rt.delivery),
    $payment: readable(rt.payment),
    $promo: readable(rt.promo),
    $totals: readable(rt.totals),
    $status: readable(status),
    $order: readable(rt.order),
    set: ({ field, value }) =>
      isCheckoutField(field) ? setField(rt, field, String(value)) : invalid('checkout.set: такого поля нет'),
    leave: ({ field }) => (isCheckoutField(field) ? leaveField(rt, field) : invalid('checkout.leave: такого поля нет')),
    pickHint: ({ id }) => pickHint(rt, id),
    selectDelivery: ({ id }) => selectDelivery(rt, id),
    selectPoint: ({ code }) => selectPoint(rt, code),
    selectPayment: ({ method }) => selectPayment(rt, method),
    applyPromo: ({ code }) => applyPromo(rt, code.trim()),
    removePromo: () => changePromo(rt, null),
    submit: () => submit(rt),
  };
}

export const checkout: SdkPart<'checkout', CheckoutModule> = {
  name: 'checkout',
  create: (core: CoreHandle): CheckoutModule => {
    const base = runtimeOf(core);
    const lines = linesStore(base);
    const rt: Built = Object.assign(base, { form: formStore(base), totals: totalsStore(base) });
    mountReads(rt);
    return moduleOf(rt, statusStore(rt, lines), lines);
  },
  markup: {
    pickHint: {
      params: ['hint-id'],
      call: (api: CheckoutModule, values): Promise<Result<unknown>> => api.pickHint({ id: values['hint-id'] ?? '' }),
    },
    selectDelivery: {
      params: ['option-id'],
      call: (api: CheckoutModule, values): Promise<Result<unknown>> =>
        Promise.resolve(api.selectDelivery({ id: values['option-id'] ?? '' })),
    },
    selectPoint: {
      params: ['point-code'],
      call: (api: CheckoutModule, values): Promise<Result<unknown>> =>
        Promise.resolve(api.selectPoint({ code: values['point-code'] ?? '' })),
    },
    selectPayment: {
      params: ['method'],
      call: (api: CheckoutModule, values): Promise<Result<unknown>> =>
        Promise.resolve(selectPaymentOf(api, values.method ?? '')),
    },
    removePromo: { params: [], call: (api: CheckoutModule): Promise<Result<unknown>> => api.removePromo() },
    submit: { params: [], call: (api: CheckoutModule): Promise<Result<unknown>> => api.submit() },
  },
};

const selectPaymentOf = (api: CheckoutModule, method: string): Result<unknown> =>
  isPaymentMethod(method) ? api.selectPayment({ method }) : invalid('checkout.selectPayment: такого способа нет');
