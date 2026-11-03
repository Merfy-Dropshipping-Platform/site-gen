import {
  HINT_DELAY_MS,
  NO_PLACE,
  dadata,
  hintRequest,
  suggestionsOf,
  type HintField,
  type Place,
} from './checkout-address';
import { deliveryCards, emptyMessage, pointsOf, settled } from './checkout-delivery';
import { NO_DELIVERY, type CheckoutRuntime } from './checkout-state';
import { cartIdOf } from './parts/cart';
import { requestJson } from './requests';
import type { Json } from './types';

// Расчёт доставки, пункты выдачи и подсказки адреса оформления (базовые секции, 03.11) — как у пяти тем
// (CheckoutDeliveryMethod.recalculate, CheckoutDeliveryForm): без адреса — свои тарифы и самовывоз, с городом —
// и перевозчики; у свежей корзины логистика первые секунды отвечает пустым списком — повтор через 2, 5 и 10 с.

export const CALC_RETRY_MS: readonly number[] = [0, 2_000, 5_000, 10_000];

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Номер корзины: у корзины модуля cart (в превью — его память страницы).
export const cartIdNow = (rt: CheckoutRuntime): string | null => (rt.cartRt === null ? null : cartIdOf(rt.cartRt.page));

// Адрес расчёта: корзина или предложение по ссылке.
function calcUrl(rt: CheckoutRuntime, path: 'calculate' | 'pickup-points'): string | null {
  if (rt.api === null) return null;
  const store = `store_id=${encodeURIComponent(rt.api.shopId)}`;
  if (rt.offerToken !== null) {
    const offerPath = path === 'calculate' ? 'delivery' : 'pickup-points';
    return `${rt.api.url}/pay/${rt.offerToken}/offer/${offerPath}?${store}`;
  }
  const cartId = cartIdNow(rt);
  return cartId === null ? null : `${rt.api.url}/store/carts/${encodeURIComponent(cartId)}/delivery/${path}?${store}`;
}

// Тело расчёта: только известное — без города шлюз отвечает своими тарифами и самовывозом.
function calcBody(place: Place, postalCode: string): Record<string, Json> {
  const body: Record<string, Json> = {};
  if (place.cityFiasId !== '') body.cityFiasId = place.cityFiasId;
  if (postalCode !== '') body.postalCode = postalCode;
  if (place.cityName !== '') body.city = place.cityName;
  if (place.region !== '') body.region = place.region;
  if (place.lat !== null) body.lat = place.lat;
  if (place.lon !== null) body.lon = place.lon;
  return body;
}

const fieldOf = (source: unknown, key: string): unknown =>
  typeof source === 'object' && source !== null ? Reflect.get(source, key) : undefined;

// Названия товаров для «не доставляем …».
const namesOf = (rt: CheckoutRuntime): ReadonlyMap<string, string> =>
  new Map((rt.offer.get()?.lines ?? rt.cartState.get().lines).map((line) => [line.productId, line.title]));

// Ответ расчёта → $delivery: карточки, выбранная — прежняя, если осталась, иначе первая (без адреса — без выбора).
function applyCalc(rt: CheckoutRuntime, data: unknown, addressKnown: boolean): void {
  const cards = deliveryCards(data, addressKnown);
  rt.cards.clear();
  cards.forEach((card) => rt.cards.set(card.option.id, card));
  const previous = rt.delivery.get().selected;
  const kept = previous !== null && rt.cards.has(previous) ? previous : null;
  const selected = kept ?? (addressKnown ? (cards[0]?.option.id ?? null) : null);
  rt.delivery.set({
    status: cards.length === 0 ? 'error' : 'ready',
    options: cards.map((card) => card.option),
    selected,
    message: cards.length === 0 ? emptyMessage(data, namesOf(rt), addressKnown) : null,
    points: NO_DELIVERY.points,
  });
  if (selected !== null) void loadPoints(rt);
}

const failCalc = (rt: CheckoutRuntime, message: string): void =>
  rt.delivery.set({ ...NO_DELIVERY, status: 'error', message });

// Один расчёт с повторами. Ответ отказом — текст сразу; сеть — повтор, последний — «Сервис доставки недоступен».
async function calcRounds(rt: CheckoutRuntime, url: string, body: Record<string, Json>, round: number): Promise<void> {
  const addressKnown = body.cityFiasId !== undefined;
  let last: unknown = null;
  for (const delay of CALC_RETRY_MS) {
    if (delay > 0) await wait(delay);
    if (round !== rt.calcRound) return;
    const reply = await requestJson(url, { method: 'POST', body });
    if (round !== rt.calcRound) return;
    if (reply.status !== 0 && fieldOf(reply.body, 'success') !== true) {
      const text = fieldOf(reply.body, 'message');
      return failCalc(rt, typeof text === 'string' && text !== '' ? text : 'Не удалось рассчитать доставку');
    }
    last = fieldOf(reply.body, 'data') ?? last;
    if (reply.status !== 0 && settled(last)) return applyCalc(rt, last, addressKnown);
  }
  if (last === null) return failCalc(rt, 'Сервис доставки недоступен');
  applyCalc(rt, last, addressKnown);
}

// Пересчёт доставки: нет физической доставки — none; нет корзины — ждём; тот же город и состав — не повторяем.
export async function recalculate(rt: CheckoutRuntime, force = false): Promise<void> {
  if (!rt.settings.get().address) return rt.delivery.set({ ...NO_DELIVERY, status: 'none' });
  const url = calcUrl(rt, 'calculate');
  // Корзина ещё читается — посчитаем, когда придут строки (слушатель корзины в parts/checkout.ts).
  if (url === null || (rt.offerToken === null && !rt.cartState.get().ready)) return;
  const place = rt.place.get();
  const lines = rt.offer.get()?.lines ?? rt.cartState.get().lines;
  const key = `${place.cityFiasId}|${lines.map((line) => `${line.id}:${line.quantity}`).join(',')}`;
  if (!force && key === rt.calcKey) return;
  rt.calcKey = key;
  rt.calcRound += 1;
  rt.delivery.set({ ...rt.delivery.get(), status: 'loading', message: null });
  await calcRounds(rt, url, calcBody(place, rt.values.get().postalCode.trim()), rt.calcRound);
}

// Пункты выдачи выбранного способа перевозчика (requiresPickupPoint): город — ФИАС или имя, регион, координаты.
export async function loadPoints(rt: CheckoutRuntime): Promise<void> {
  const delivery = rt.delivery.get();
  const card = delivery.selected === null ? undefined : rt.cards.get(delivery.selected);
  const base = calcUrl(rt, 'pickup-points');
  if (card === undefined || !card.option.needsPoint || base === null) return;
  const { choice } = card;
  const place = rt.place.get();
  const query = new URLSearchParams({ carrier: choice.carrier ?? '' });
  if (choice.pickupPointKind !== null) query.set('kind', choice.pickupPointKind);
  if (place.cityFiasId !== '') query.set('cityFiasId', place.cityFiasId);
  if (place.cityName !== '') query.set('city', place.cityName);
  rt.delivery.set({ ...delivery, points: { status: 'loading', items: [], selected: null } });
  const reply = await requestJson(`${base}&${query.toString()}`, { method: 'GET' });
  const now = rt.delivery.get();
  if (now.selected !== card.option.id) return;
  const ok = reply.status >= 200 && reply.status < 300;
  const items = ok ? pointsOf(reply.body, choice.pickupPointKind) : [];
  rt.delivery.set({ ...now, points: { status: ok ? 'ready' : 'error', items, selected: null } });
}

// Подсказки поля через HINT_DELAY_MS после последней буквы; нет ключа или меньше 2 знаков — подсказок нет.
export function scheduleHints(rt: CheckoutRuntime, field: HintField, query: string): void {
  if (rt.hintTimer !== null) clearTimeout(rt.hintTimer);
  rt.hintTimer = null;
  const token = rt.api?.dadata ?? null;
  if (token === null || query.trim().length < 2) {
    rt.suggestions = [];
    rt.hints.set({ field: null, items: [] });
    return;
  }
  rt.hintTimer = setTimeout(() => void showHints(rt, token, field, query.trim()), HINT_DELAY_MS);
}

async function showHints(rt: CheckoutRuntime, token: string, field: HintField, query: string): Promise<void> {
  const body = hintRequest(field, query, rt.place.get(), rt.values.get().city.trim());
  const found = suggestionsOf(field, await dadata(token, 'suggest/address', body));
  if (rt.values.get()[field].trim() !== query) return; // покупатель уже печатает дальше
  rt.suggestions = found;
  rt.hints.set({ field, items: found.map((item, at) => ({ id: `h${at + 1}`, text: item.text })) });
}

// Город набран без выбора подсказки (автозаполнение, вставка): ФИАС — по первой подсказке DaData.
export async function resolveCity(rt: CheckoutRuntime): Promise<void> {
  const token = rt.api?.dadata ?? null;
  const city = rt.values.get().city.trim();
  if (token === null || city.length < 3 || rt.place.get().cityFiasId !== '') return;
  const [first] = suggestionsOf(
    'city',
    await dadata(token, 'suggest/address', hintRequest('city', city, NO_PLACE, '', 1)),
  );
  if (first === undefined || rt.values.get().city.trim() !== city) return;
  rt.place.set({ ...NO_PLACE, ...cityOf(first.place) });
  await recalculate(rt);
}

// Только город из разобранного места: улица и дом — у адреса.
export const cityOf = (place: Place): Pick<Place, 'cityFiasId' | 'cityName' | 'region' | 'lat' | 'lon'> => ({
  cityFiasId: place.cityFiasId,
  cityName: place.cityName,
  region: place.region,
  lat: place.lat,
  lon: place.lon,
});
