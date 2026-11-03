// Подсказки адреса DaData (базовые секции, 03.11) — как у пяти тем (CheckoutDeliveryForm, CheckoutDeliveryMethod):
// город — подсказка уровня «город — населённый пункт», адрес — «улица — квартира» в выбранном городе; ФИАС города,
// регион и координаты уходят в расчёт доставки, улица, дом и квартира — в адрес заказа. Ключ — публичный ключ подсказок
// из конфига витрины; нет ключа — подсказок нет, поля работают как обычные.

export const DADATA_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs';
export const HINT_DELAY_MS = 300;
export const HINT_COUNT = 8;

export type HintField = 'city' | 'address';

// Разобранный адрес: что знаем о городе и доме.
export interface Place {
  readonly cityFiasId: string;
  readonly cityName: string;
  readonly region: string;
  readonly lat: number | null;
  readonly lon: number | null;
  readonly street: string;
  readonly house: string;
  readonly flat: string;
}

export const NO_PLACE: Place = {
  cityFiasId: '',
  cityName: '',
  region: '',
  lat: null,
  lon: null,
  street: '',
  house: '',
  flat: '',
};

export interface Suggestion {
  readonly text: string; // что встаёт в поле
  readonly postalCode: string;
  readonly place: Place;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const coordinate = (value: unknown): number | null => {
  const parsed = Number.parseFloat(textOf(value));
  return Number.isFinite(parsed) ? parsed : null;
};

// Улица, дом и квартира одной строкой: «ул Ленина, д 10, кв 5».
const shortAddress = (data: Record<string, unknown>): string =>
  [
    textOf(data.street_with_type),
    textOf(data.house) === '' ? '' : `${textOf(data.house_type) || 'д'} ${textOf(data.house)}`,
    textOf(data.flat) === '' ? '' : `${textOf(data.flat_type) || 'кв'} ${textOf(data.flat)}`,
  ]
    .filter((part) => part !== '')
    .join(', ');

function placeOf(data: Record<string, unknown>): Place {
  return {
    cityFiasId: textOf(data.city_fias_id) || textOf(data.settlement_fias_id),
    cityName: textOf(data.city) || textOf(data.settlement),
    region: textOf(data.region_with_type) || textOf(data.region),
    lat: coordinate(data.geo_lat),
    lon: coordinate(data.geo_lon),
    street: textOf(data.street_with_type) || textOf(data.street),
    house: textOf(data.house),
    flat: textOf(data.flat),
  };
}

function suggestionOf(field: HintField, item: Record<string, unknown>): Suggestion | null {
  const data = isRecord(item.data) ? item.data : null;
  if (data === null) return null;
  const place = placeOf(data);
  const text = field === 'city' ? textOf(item.value) || place.cityName : shortAddress(data) || textOf(item.value);
  return text === '' ? null : { text, postalCode: textOf(data.postal_code), place };
}

// Подсказки из ответа DaData.
export function suggestionsOf(field: HintField, body: unknown): Suggestion[] {
  const raw: unknown = isRecord(body) ? body.suggestions : undefined;
  const list = Array.isArray(raw) ? raw.filter(isRecord) : [];
  return list.map((item) => suggestionOf(field, item)).filter((item) => item !== null);
}

// Тело запроса подсказок: город — «город — населённый пункт»; адрес — «улица — квартира» в выбранном городе.
export function hintRequest(field: HintField, query: string, place: Place, city: string, count = HINT_COUNT): object {
  if (field === 'city') return { query, count, from_bound: { value: 'city' }, to_bound: { value: 'settlement' } };
  const locations =
    place.cityFiasId === '' ? [city === '' ? { country: 'Россия' } : { city }] : [{ city_fias_id: place.cityFiasId }];
  return { query, count, from_bound: { value: 'street' }, to_bound: { value: 'flat' }, locations };
}

// Запрос к DaData: сбой и не 2xx — пустой ответ (подсказок нет, поле работает дальше).
export async function dadata(
  token: string,
  method: 'suggest/address' | 'findById/address',
  body: object,
): Promise<unknown> {
  try {
    const response = await fetch(`${DADATA_URL}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Token ${token}` },
      body: JSON.stringify(body),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}
