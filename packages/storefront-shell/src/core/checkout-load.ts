import { LAST_ORDER_KEY, ORDER_POLL_MS, ORDER_POLL_TIMES, emptyOrder, orderOf, sampleOrder } from './checkout-order';
import { paymentOf } from './checkout-payment';
import { settingsOf } from './checkout-form';
import type { CheckoutRuntime, OfferData } from './checkout-state';
import { tokenOf } from './customer-token';
import { navigation } from './navigation';
import { requestJson } from './requests';
import type { CartLine } from './types';

// Чтения оформления (базовые секции, 03.11): настройки формы магазина, способы оплаты, предложение по ссылке и сводка
// заказа для «Спасибо». Каждое — один раз, когда его стор впервые читает секция (onMount в parts/checkout.ts).

export const OFFER_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const LOGIN_PATH = '/login?redirect=%2Fcheckout'; // строкой: вызов на верхнем уровне остался бы в ядре

const fieldOf = (source: unknown, key: string): unknown =>
  typeof source === 'object' && source !== null ? Reflect.get(source, key) : undefined;

// Настройки формы: сбой и пустой магазин — полная форма (fail-open). Гость магазина с обязательным входом — на «Вход»
// (настоящий барьер — orders, 403; это удобство, как у пяти тем). Превью не уходит со страницы.
export async function loadSettings(rt: CheckoutRuntime): Promise<void> {
  if (rt.offerToken !== null || rt.api === null) return;
  const reply = await requestJson(`${rt.api.url}/public/sites/${encodeURIComponent(rt.api.shopId)}/settings`, {
    method: 'GET',
  });
  const settings = settingsOf(reply.status === 0 ? null : fieldOf(reply.body, 'settings'));
  rt.settings.set(settings);
  if (rt.core.mode === 'live' && settings.signIn && tokenOf(rt.page) === null) navigation.go(LOGIN_PATH);
}

// Способы оплаты магазина: нет ответа — все способы, как у пяти тем.
export async function loadPayment(rt: CheckoutRuntime): Promise<void> {
  if (rt.api === null) return;
  const reply = await requestJson(
    `${rt.api.url}/billing/shops/${encodeURIComponent(rt.api.shopId)}/payment-config/public`,
    { method: 'GET' },
  );
  const ok = reply.status >= 200 && reply.status < 300;
  rt.payment.set(paymentOf(ok ? reply.body : null, rt.payment.get().selected));
}

const numberOf = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');

function offerLine(item: unknown, at: number): CartLine {
  const unit = numberOf(fieldOf(item, 'unitPriceCents'));
  const quantity = Math.max(1, numberOf(fieldOf(item, 'quantity')));
  const options = fieldOf(item, 'options');
  return {
    id: textOf(fieldOf(item, 'id')) || `offer-${at + 1}`,
    productId: textOf(fieldOf(item, 'productId')),
    variantId: textOf(fieldOf(item, 'variantCombinationId')) || null,
    quantity,
    price: { amount: unit, currency: 'RUB' },
    title: textOf(fieldOf(item, 'name')) || 'Товар',
    image: textOf(fieldOf(item, 'imageUrl')) || null,
    options:
      typeof options === 'object' && options !== null
        ? Object.fromEntries(
            Object.entries(options).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
          )
        : {},
    total: { amount: numberOf(fieldOf(item, 'netCents')) || unit * quantity, currency: 'RUB' },
    gift: false,
    compareAt: null,
  };
}

function offerOf(data: unknown): OfferData {
  const items = fieldOf(data, 'items');
  return {
    version: numberOf(fieldOf(data, 'version')),
    lines: Array.isArray(items) ? items.map(offerLine) : [],
    subtotal: numberOf(fieldOf(data, 'subtotalCents')),
    discount: numberOf(fieldOf(data, 'discountCents')),
    goods: numberOf(fieldOf(data, 'goodsCents')),
    email: textOf(fieldOf(data, 'email')),
    phone: textOf(fieldOf(data, 'customerPhone')),
  };
}

// Предложение по ссылке: оформить можно только черновик — иначе страница ссылки шлюза (она покажет оплату или статус).
// Ответ — настройки (вход не нужен, телефон — при доставке), строки, итоги и контакты из предложения.
export async function loadOffer(rt: CheckoutRuntime, onFail: (code: string) => void): Promise<void> {
  if (rt.offerToken === null || rt.api === null) return;
  const { url, shopId } = rt.api;
  const reply = await requestJson(`${url}/pay/${rt.offerToken}/offer?store_id=${encodeURIComponent(shopId)}`, {
    method: 'GET',
  });
  const data = fieldOf(reply.body, 'success') === true ? fieldOf(reply.body, 'data') : undefined;
  if (data === undefined) return onFail(reply.status === 0 ? 'network' : textOf(fieldOf(reply.body, 'code')));
  if (fieldOf(data, 'editable') !== true) return navigation.go(`${url}/pay/${rt.offerToken}`);
  const offer = offerOf(data);
  const address = fieldOf(data, 'deliveryRequired') !== false;
  rt.settings.set({ ready: true, phone: address, name: 'name-surname', address, signIn: false, offer: true });
  rt.values.set({ ...rt.values.get(), email: offer.email, phone: offer.phone || rt.values.get().phone });
  rt.offer.set(offer);
}

// Номер заказа «Спасибо»: ?orderId= адреса, иначе последний оформленный в этом браузере.
const orderIdOf = (rt: CheckoutRuntime): string | null => {
  const fromPage = rt.core.mode === 'live' ? (new URLSearchParams(window.location.search).get('orderId') ?? '') : '';
  return fromPage !== '' ? fromPage : rt.page.getItem(LAST_ORDER_KEY);
};

// Сводка заказа: оплата ещё идёт — перечитать через ORDER_POLL_MS, не больше ORDER_POLL_TIMES раз. Превью — пример.
export async function loadOrder(rt: CheckoutRuntime, round = 0): Promise<void> {
  if (rt.core.mode === 'preview') return rt.order.set(sampleOrder());
  const id = orderIdOf(rt);
  if (id === null || id === '' || rt.api === null) return rt.order.set(emptyOrder('missing'));
  const reply = await requestJson(`${rt.api.url}/orders/${encodeURIComponent(id)}/summary`, { method: 'GET' });
  const order = orderOf(reply.body);
  if (order === null) return rt.order.set(emptyOrder(reply.status === 0 ? 'error' : 'missing'));
  rt.order.set(order);
  if (order.payment === 'pending' && round < ORDER_POLL_TIMES)
    setTimeout(() => void loadOrder(rt, round + 1), ORDER_POLL_MS);
}
