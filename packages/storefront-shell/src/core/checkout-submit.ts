import { cartIdNow } from './checkout-calc';
import type { DeliveryCard } from './checkout-delivery';
import { customerName } from './checkout-form';
import { LAST_ORDER_KEY } from './checkout-order';
import { type CheckoutRuntime, errorsNow } from './checkout-state';
import { HANDOFF_KEY, PENDING_ORDER_KEY } from './cart-checkout';
import { tokenOf } from './customer-token';
import type { Reply } from './failures';
import { navigation } from './navigation';
import { dropCartId } from './parts/cart';
import { requestJson, type JsonRequest } from './requests';
import type { ErrorCode, Json, PaymentMethod, Result } from './types';

// «Оплатить» (базовые секции, 03.11) — цепочка пяти тем (CheckoutSubmit): промокод заново, покупатель, адрес, пункт
// выдачи, заказ из корзины, платёж выбранным способом и переход на страницу платёжки. Данные карты на витрине не
// вводятся. Повтор не создаёт второй заказ: orders отдаёт тот же заказ, пока он ждёт оплаты. По ссылке предложения —
// один запрос /pay/<токен>/offer/checkout.

export const PROMO_KEY = 'merfy:promoCode'; // промокод корзины в sessionStorage — тот же ключ, что у пяти тем
const LOGIN_PATH = '/login?redirect=%2Fcheckout'; // строкой: вызов на верхнем уровне остался бы в ядре
const OFFER_RELOAD_MS = 1_500;

// Тексты отказов ссылки предложения — как у пяти тем (runtime/checkout-offer.ts).
const OFFER_TEXT: Readonly<Record<string, string>> = {
  insufficient_stock: 'Товара нет в нужном количестве. Свяжитесь с продавцом',
  order_processing: 'Заказ оформляется. Повторите через несколько секунд',
  payments_not_configured: 'Магазин сейчас не принимает онлайн-оплату',
  shop_frozen: 'Магазин временно недоступен',
  delivery_option_unavailable: 'Выбранный способ доставки больше недоступен. Выберите другой',
  delivery_incomplete: 'Заполните телефон, адрес и пункт выдачи',
  delivery_unavailable: 'Не удалось рассчитать доставку. Попробуйте ещё раз через минуту',
  invalid_phone: 'Проверьте номер телефона',
  customer_required: 'Укажите имя',
  payment_create_failed: 'Не удалось перейти к оплате. Попробуйте ещё раз через минуту',
  offer_changed: 'Продавец изменил заказ. Обновляем страницу…',
  network: 'Не удалось загрузить заказ. Обновите страницу через минуту',
};
export const OFFER_FALLBACK = 'Не удалось оформить заказ. Попробуйте ещё раз через минуту';
export const offerText = (code: string): string => OFFER_TEXT[code] ?? OFFER_FALLBACK;

type Outcome =
  | { readonly ok: true; readonly orderId: string }
  | { readonly ok: false; readonly code: ErrorCode; readonly text: string };
const fail = (text: string, code: ErrorCode = 'server'): Outcome => ({ ok: false, code, text });

const fieldOf = (source: unknown, key: string): unknown =>
  typeof source === 'object' && source !== null ? Reflect.get(source, key) : undefined;
const okReply = (reply: Reply): boolean => reply.status >= 200 && reply.status < 300;
const codeOf = (reply: Reply): string => {
  const code = fieldOf(reply.body, 'code');
  return typeof code === 'string' ? code : '';
};

// Текст отказа сервера покупателю: message строкой или первой строкой списка, иначе error, иначе запасной.
function serverText(reply: Reply, fallback: string): string {
  if (reply.status === 0) return 'Нет связи с магазином. Проверьте интернет и попробуйте ещё раз';
  const message = fieldOf(reply.body, 'message');
  const first: unknown = Array.isArray(message) ? message[0] : message;
  const error = fieldOf(reply.body, 'error');
  if (typeof first === 'string' && first !== '') return first;
  return typeof error === 'string' && error !== '' ? error : fallback;
}

const send = (rt: CheckoutRuntime, path: string, init: JsonRequest): Promise<Reply> =>
  requestJson(`${rt.api?.url ?? ''}${path}`, init);

const selectedCard = (rt: CheckoutRuntime): DeliveryCard | undefined => {
  const id = rt.delivery.get().selected;
  return id === null ? undefined : rt.cards.get(id);
};

// Улица, дом, квартира: из подсказки DaData, иначе весь «Адрес» — улицей.
function addressParts(rt: CheckoutRuntime): { street: string; building: string; apartment: string; full: string } {
  const place = rt.place.get();
  const full = rt.values.get().address.trim();
  return { street: place.street || full, building: place.house, apartment: place.flat, full };
}

// Выбор доставки для заказа — как checkout:delivery-changed пяти тем; пункт выдачи — код и адрес точки.
function deliveryMethod(rt: CheckoutRuntime): Record<string, Json> {
  const card = selectedCard(rt);
  if (card === undefined) return { type: 'none', costCents: 0 };
  const delivery = rt.delivery.get();
  const point = delivery.points.items.find((item) => item.code === delivery.points.selected) ?? null;
  return {
    ...card.choice,
    pickupPointCode: card.option.needsPoint ? (point?.code ?? null) : null,
    pickupPointAddress: card.option.needsPoint ? (point?.address ?? null) : null,
  };
}

function metadataOf(rt: CheckoutRuntime, method: PaymentMethod): Record<string, Json> {
  const values = rt.values.get();
  const settings = rt.settings.get();
  const name = customerName(values, settings.name);
  const metadata: Record<string, Json> = {
    paymentMethod: method,
    deliveryMethod: settings.address ? deliveryMethod(rt) : { type: 'none', costCents: 0 },
    contactEmail: values.email.trim(),
    customerName: name,
  };
  if (settings.phone && values.phone !== '') metadata.contactPhone = values.phone;
  if (!settings.address) return metadata;
  metadata.deliveryAddress = {
    country: values.country || 'Россия',
    city: values.city.trim(),
    fullAddress: addressParts(rt).full,
    postalCode: values.postalCode.trim(),
    fiasId: rt.place.get().cityFiasId,
    firstName: settings.name === 'surname' ? '' : values.firstName.trim(),
    lastName: settings.name === 'name' ? '' : values.lastName.trim(),
    fullName: name,
  };
  return metadata;
}

// Промокод заново (у пяти тем корзина могла пересоздаться): протух — оформление прерывается, полную сумму не берём.
async function reapplyPromo(rt: CheckoutRuntime, cartId: string): Promise<Outcome | null> {
  const code = rt.promo.get().code;
  if (code === null) return null;
  const reply = await send(rt, `/orders/cart/${cartId}/promo`, { method: 'POST', body: { promoCode: code } });
  return okReply(reply) ? null : fail(serverText(reply, 'Промокод больше недействителен — обновите заказ'));
}

// Покупатель и адрес на корзине: телефон — только когда магазин его просит.
async function saveCustomer(rt: CheckoutRuntime, cartId: string): Promise<void> {
  const values = rt.values.get();
  const settings = rt.settings.get();
  const customer: Record<string, Json> = { email: values.email.trim(), name: customerName(values, settings.name) };
  if (settings.phone) customer.phone = values.phone;
  await send(rt, `/orders/cart/${cartId}/customer`, { method: 'PATCH', body: customer });
  if (!settings.address) return;
  const parts = addressParts(rt);
  await send(rt, `/orders/cart/${cartId}/address`, {
    method: 'PATCH',
    body: {
      country: values.country || 'Россия',
      city: values.city.trim(),
      street: parts.street,
      building: parts.building,
      apartment: parts.apartment,
      postalCode: values.postalCode.trim(),
    },
  });
}

// Пункт выдачи перевозчика доезжает до заказа только через /delivery/select (иначе отправление отклонят после оплаты).
async function savePoint(rt: CheckoutRuntime, cartId: string): Promise<Outcome | null> {
  const card = selectedCard(rt);
  if (!rt.settings.get().address || card === undefined || !card.option.needsPoint) return null;
  const method = deliveryMethod(rt);
  const values = rt.values.get();
  const parts = addressParts(rt);
  const body: Record<string, Json> = {
    type: card.choice.type,
    carrier: card.choice.carrier,
    mode: card.choice.mode,
    deliveryCostCents: card.choice.costCents,
    pickupPointCode: method.pickupPointCode ?? null,
    pickupPointAddress: method.pickupPointAddress ?? null,
    address: {
      city: values.city.trim(),
      street: parts.street,
      house: parts.building,
      apartment: parts.apartment,
      postalCode: values.postalCode.trim(),
      fiasId: rt.place.get().cityFiasId,
      fullAddress: parts.full,
    },
  };
  if (card.choice.tariffCode !== null) body.tariffCode = card.choice.tariffCode;
  const reply = await send(rt, `/store/carts/${cartId}/delivery/select`, { method: 'POST', body });
  return okReply(reply) ? null : fail('Не удалось сохранить пункт выдачи. Выберите точку заново.');
}

const bearer = (rt: CheckoutRuntime): Pick<JsonRequest, 'token'> => {
  const token = tokenOf(rt.page);
  return token === null ? {} : { token };
};

// Заказ из корзины: 404 — корзина устарела (номер стёрт); 403 — магазин требует вход.
async function placeOrder(rt: CheckoutRuntime, cartId: string, method: PaymentMethod): Promise<Outcome> {
  const reply = await send(rt, `/orders/cart/${cartId}/checkout`, {
    method: 'POST',
    body: { metadata: metadataOf(rt, method) },
    ...bearer(rt),
  });
  if (reply.status === 404 && rt.cartRt !== null) dropCartId(rt.cartRt.page, cartId);
  if (reply.status === 404) return fail('Корзина устарела. Вернитесь в каталог и добавьте товары заново.', 'refused');
  if (reply.status === 403) {
    navigation.go(LOGIN_PATH);
    return fail('Войдите, чтобы оформить заказ', 'unauthorized');
  }
  const data = fieldOf(reply.body, 'data');
  const id = fieldOf(data, 'orderId') ?? fieldOf(data, 'id');
  if (!okReply(reply) || typeof id !== 'string' || id === '')
    return fail(serverText(reply, 'Не удалось оформить заказ'));
  return { ok: true, orderId: id };
}

// Платёж выбранным способом → адрес страницы платёжки; вернуться — на «Спасибо за заказ» этого заказа.
async function createPayment(rt: CheckoutRuntime, orderId: string, method: PaymentMethod): Promise<string | Outcome> {
  const returnUrl = `${window.location.origin}/checkout-result?orderId=${encodeURIComponent(orderId)}`;
  const reply = await send(rt, `/orders/${orderId}/create-payment`, {
    method: 'POST',
    body: { returnUrl, paymentMethod: method },
    ...bearer(rt),
  });
  const url = fieldOf(fieldOf(reply.body, 'data'), 'confirmationUrl');
  return okReply(reply) && typeof url === 'string' && url !== '' ? url : fail(serverText(reply, 'Ошибка платежа'));
}

// Заказ ушёл на оплату: корзину сведёт ядро корзины по статусу оплаты (cart-checkout.ts, watchPendingOrder) — оплачен
// — пусто, не оплачен — копия строк станет новой корзиной.
function rememberOrder(rt: CheckoutRuntime, cartId: string, orderId: string): void {
  const lines = rt.cartState.get().lines.filter((line) => !line.gift);
  const copy = lines.map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity }));
  rt.page.setItem(LAST_ORDER_KEY, orderId);
  rt.page.setItem(HANDOFF_KEY, JSON.stringify({ cartId, lines: copy }));
  rt.page.setItem(PENDING_ORDER_KEY, JSON.stringify({ orderId, apiBase: rt.api?.url ?? '' }));
  if (rt.cartRt !== null) dropCartId(rt.cartRt.page, cartId);
  forgetPromo();
}

export function forgetPromo(): void {
  try {
    window.sessionStorage.removeItem(PROMO_KEY);
  } catch {
    // sessionStorage закрыт браузером — промокода там и нет
  }
}

export async function submitCart(rt: CheckoutRuntime, method: PaymentMethod): Promise<Outcome> {
  const cartId = cartIdNow(rt);
  if (cartId === null) return fail('Корзина пуста. Добавьте товары.', 'refused');
  const steps = [
    () => reapplyPromo(rt, cartId),
    () => saveCustomer(rt, cartId).then(() => null),
    () => savePoint(rt, cartId),
  ];
  for (const step of steps) {
    const stopped = await step();
    if (stopped !== null) return stopped;
  }
  const placed = await placeOrder(rt, cartId, method);
  if (!placed.ok) return placed;
  const url = await createPayment(rt, placed.orderId, method);
  if (typeof url !== 'string') return url;
  rememberOrder(rt, cartId, placed.orderId);
  navigation.go(url);
  return placed;
}

// Оплата предложения: имя, телефон, адрес и выбор доставки — серверу; цену и итог считает он.
function offerBody(rt: CheckoutRuntime, method: PaymentMethod): Record<string, Json> {
  const values = rt.values.get();
  const body: Record<string, Json> = {
    version: rt.offer.get()?.version ?? 0,
    customer: { name: customerName(values, 'name-surname'), phone: values.phone === '' ? null : values.phone },
    paymentMethod: method,
  };
  if (!rt.settings.get().address) return body;
  const parts = addressParts(rt);
  const delivery = deliveryMethod(rt);
  body.address = {
    city: values.city.trim(),
    street: parts.street,
    house: parts.building,
    apartment: parts.apartment,
    postalCode: values.postalCode.trim(),
    fiasId: rt.place.get().cityFiasId,
  };
  const keys = [
    'carrier',
    'mode',
    'tariffCode',
    'customTariffId',
    'pickupPointId',
    'pickupPointCode',
    'pickupPointAddress',
  ];
  body.delivery = Object.fromEntries(keys.map((key) => [key, delivery[key] ?? null]));
  return body;
}

export async function submitOffer(rt: CheckoutRuntime, method: PaymentMethod): Promise<Outcome> {
  const token = rt.offerToken ?? '';
  const store = encodeURIComponent(rt.api?.shopId ?? '');
  const reply = await send(rt, `/pay/${token}/offer/checkout?store_id=${store}`, {
    method: 'POST',
    body: offerBody(rt, method),
  });
  const url = fieldOf(fieldOf(reply.body, 'data'), 'redirectUrl');
  if (okReply(reply) && typeof url === 'string' && url !== '') {
    navigation.go(url);
    return { ok: true, orderId: '' };
  }
  const code = reply.status === 0 ? 'network' : codeOf(reply);
  if (code === 'already_paid' || code === 'pay_link_invalid') navigation.go(`${rt.api?.url ?? ''}/pay/${token}`);
  if (code === 'offer_changed') setTimeout(() => window.location.reload(), OFFER_RELOAD_MS);
  return fail(offerText(code), 'refused');
}

// Отправка: ошибки полей — видимы все; гость при обязательном входе — на «Вход»; превью заказ не оформляет.
export function blockedSubmit(rt: CheckoutRuntime): Outcome | null {
  rt.marks.set({ ...rt.marks.get(), shown: true });
  if (rt.settings.get().signIn && rt.offerToken === null && tokenOf(rt.page) === null) {
    if (rt.core.mode === 'live') navigation.go(LOGIN_PATH);
    return fail('Войдите, чтобы оформить заказ', 'unauthorized');
  }
  const lines = rt.offer.get()?.lines ?? rt.cartState.get().lines;
  if (lines.length === 0) return fail('Корзина пуста. Добавьте товары.', 'refused');
  if (Object.keys(errorsNow(rt)).length > 0) return fail('Проверьте поля формы', 'invalid');
  if (rt.core.mode === 'preview') return fail('В превью заказ не оформляется', 'refused');
  return null;
}

export const resultOf = (outcome: Outcome): Result<{ readonly orderId: string }> =>
  outcome.ok
    ? { ok: true, data: { orderId: outcome.orderId } }
    : { ok: false, error: { code: outcome.code, message: outcome.text } };

export type { Outcome };
