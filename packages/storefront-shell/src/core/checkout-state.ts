import { NO_PLACE, type Place, type Suggestion } from './checkout-address';
import type { DeliveryCard } from './checkout-delivery';
import { DEFAULT_SETTINGS, emptyForm, formErrors, visibleErrors, type Choice } from './checkout-form';
import { emptyOrder } from './checkout-order';
import { DEFAULT_PAYMENT } from './checkout-payment';
import { tokenOf } from './customer-token';
import type { CartRuntime } from './parts/cart';
import type { KeyValue } from './storage';
import { type Atom, atom, computed, onMount } from './stores';
import type {
  CartLine,
  CartModule,
  CartState,
  CartTotals,
  CheckoutDelivery,
  CheckoutErrorKey,
  CheckoutForm,
  CheckoutHints,
  CheckoutLines,
  CheckoutOrder,
  CheckoutPayment,
  CheckoutPromo,
  CheckoutSettings,
  CheckoutStatus,
  CheckoutTotals,
  CoreHandle,
  Money,
  ReadableStore,
} from './types';

// Состояние оформления заказа (базовые секции, 03.11): атомы модуля и сторы, которые из них считаются. Ошибки полей,
// итоги и «можно ли оплатить» — производные: секции их только читают.

// Оплата предложения расширения по ссылке (/checkout?offer=<токен>): позиции и итоги — его, только для чтения.
export interface OfferData {
  readonly version: number;
  readonly lines: readonly CartLine[];
  readonly subtotal: number;
  readonly discount: number;
  readonly goods: number; // позиции за вычетом скидки, без доставки
  readonly email: string;
  readonly phone: string;
}

export interface Marks {
  readonly left: readonly CheckoutErrorKey[]; // поля, которые покупатель покинул
  readonly shown: boolean; // «Оплатить» нажимали — видны все ошибки
}

export interface Sending {
  readonly submitting: boolean;
  readonly error: string | null;
}

export interface CheckoutApi {
  readonly url: string;
  readonly shopId: string;
  readonly dadata: string | null; // публичный ключ подсказок адреса
}

export interface CheckoutAtoms {
  readonly values: Atom<CheckoutForm['values']>;
  readonly marks: Atom<Marks>;
  readonly place: Atom<Place>;
  readonly settings: Atom<CheckoutSettings>;
  readonly hints: Atom<CheckoutHints>;
  readonly delivery: Atom<CheckoutDelivery>;
  readonly payment: Atom<CheckoutPayment>;
  readonly promo: Atom<CheckoutPromo>;
  readonly offer: Atom<OfferData | null>;
  readonly sending: Atom<Sending>;
  readonly order: Atom<CheckoutOrder>;
  readonly cartState: Atom<CartState>; // зеркало ctx.cart.$cart, пока на сторы оформления подписаны
  readonly cartTotals: Atom<CartTotals>; // зеркало ctx.cart.$totals
}

export interface CheckoutRuntime extends CheckoutAtoms {
  readonly core: CoreHandle;
  readonly api: CheckoutApi | null;
  readonly cart: CartModule;
  readonly cartRt: CartRuntime | null;
  readonly page: KeyValue;
  readonly offerToken: string | null;
  readonly cards: Map<string, DeliveryCard>; // способы последнего расчёта по id
  suggestions: readonly Suggestion[]; // подсказки, которые сейчас в $hints
  hintTimer: ReturnType<typeof setTimeout> | null;
  calcRound: number; // номер расчёта доставки: ответ старого расчёта не пишется
  calcKey: string | null; // что считали в последний раз: город и состав корзины
}

export const NO_DELIVERY: CheckoutDelivery = {
  status: 'idle',
  options: [],
  selected: null,
  message: null,
  points: { status: 'idle', items: [], selected: null },
};

// Зеркало стора другого модуля: подписка на источник — пока на зеркало подписаны.
function mirrorOf<T>(core: CoreHandle, source: ReadableStore<T>): Atom<T> {
  const mirror = atom<T>(source.get());
  onMount(mirror, () => {
    mirror.set(source.get());
    return core.watch(source, (value) => mirror.set(value));
  });
  return mirror;
}

export function createAtoms(core: CoreHandle, cart: CartModule): CheckoutAtoms {
  return {
    values: atom(emptyForm().values),
    marks: atom<Marks>({ left: [], shown: false }),
    place: atom<Place>(NO_PLACE),
    settings: atom<CheckoutSettings>(DEFAULT_SETTINGS),
    hints: atom<CheckoutHints>({ field: null, items: [] }),
    delivery: atom<CheckoutDelivery>(NO_DELIVERY),
    payment: atom<CheckoutPayment>(DEFAULT_PAYMENT),
    promo: atom<CheckoutPromo>({ code: null, busy: false, error: null }),
    offer: atom<OfferData | null>(null),
    sending: atom<Sending>({ submitting: false, error: null }),
    order: atom<CheckoutOrder>(emptyOrder('loading')),
    cartState: mirrorOf(core, cart.$cart),
    cartTotals: mirrorOf(core, cart.$totals),
  };
}

// Выбранный способ доставки и что известно о доме — вход правил формы.
export function choiceOf(
  rt: CheckoutRuntime,
  delivery: CheckoutDelivery,
  payment: CheckoutPayment,
  place: Place,
): Choice {
  const selected = delivery.selected === null ? undefined : rt.cards.get(delivery.selected);
  return {
    delivery: selected?.option ?? null,
    point: delivery.points.selected,
    payment: payment.selected !== null && !payment.unavailable,
    house: place.house !== '',
  };
}

// Все ошибки формы сейчас — для отправки и «можно ли оплатить».
export const errorsNow = (rt: CheckoutRuntime): Partial<Record<CheckoutErrorKey, string>> =>
  formErrors(rt.values.get(), rt.settings.get(), choiceOf(rt, rt.delivery.get(), rt.payment.get(), rt.place.get()));

// $form: значения и видимые ошибки.
export const formStore = (rt: CheckoutRuntime) =>
  computed(
    [rt.values, rt.marks, rt.settings, rt.delivery, rt.payment, rt.place],
    (values, marks, settings, delivery, payment, place): CheckoutForm => {
      const all = formErrors(values, settings, choiceOf(rt, delivery, payment, place));
      return { values, errors: visibleErrors(all, new Set(marks.left), marks.shown) };
    },
  );

const money = (amount: number): Money => ({ amount, currency: 'RUB' });

// Строки: корзина или предложение.
export const linesStore = (rt: CheckoutRuntime) =>
  computed(
    [rt.cartState, rt.offer],
    (cart, offer): CheckoutLines =>
      rt.offerToken === null
        ? { ready: cart.ready, lines: cart.lines }
        : { ready: offer !== null, lines: offer?.lines ?? [] },
  );

const deliveryCost = (rt: CheckoutRuntime, delivery: CheckoutDelivery): Money | null => {
  const card = delivery.selected === null ? undefined : rt.cards.get(delivery.selected);
  return card === undefined ? null : card.option.price;
};

const offerTotals = (offer: OfferData | null): CartTotals => ({
  ready: offer !== null,
  subtotal: money(offer?.subtotal ?? 0),
  discount: money(offer?.discount ?? 0),
  discountName: null,
  extensionDiscount: money(0),
  total: money(offer?.goods ?? 0),
});

// Итоги: суммы корзины (их считает orders) или предложения плюс выбранная доставка.
export const totalsStore = (rt: CheckoutRuntime) =>
  computed([rt.cartTotals, rt.offer, rt.delivery], (cart, offer, delivery): CheckoutTotals => {
    const base = rt.offerToken === null ? cart : offerTotals(offer);
    const shipping = deliveryCost(rt, delivery);
    return { ...base, delivery: shipping, total: money(base.total.amount + (shipping?.amount ?? 0)) };
  });

// $status: всё обязательное на месте — оплатить можно; гость при обязательном входе — вход.
export const statusStore = (rt: CheckoutRuntime, lines: ReturnType<typeof linesStore>) =>
  computed(
    [rt.values, rt.settings, rt.delivery, rt.payment, rt.place, rt.sending, lines],
    (values, settings, delivery, payment, place, sending, current): CheckoutStatus => {
      const errors = formErrors(values, settings, choiceOf(rt, delivery, payment, place));
      const signIn = settings.signIn && !settings.offer && tokenOf(rt.page) === null;
      const complete = Object.keys(errors).length === 0 && current.lines.length > 0 && !signIn;
      return { complete, submitting: sending.submitting, error: sending.error, signIn };
    },
  );
