import type { CheckoutDeliveryOption, CheckoutPoint } from './types';

// Способы доставки оформления (базовые секции, 03.11) — как у пяти тем (CheckoutDeliveryMethod.buildOptions): ответ
// POST /store/carts/:id/delivery/calculate → { deliveryOptions, pickupPoints, unavailableProducts?, cdekError? }.
// Самовывоз — карточка на каждую точку магазина; свой тариф — карточка на тариф; перевозчик — одна, самая дешёвая
// карточка на «перевозчик + режим + тип точки» (дубли тарифов отличаются только плечом отправки). Сортировка по цене,
// «дешевле всего» — у единственной самой дешёвой платной.

// Что уходит в заказ о выбранном способе — как событие checkout:delivery-changed пяти тем.
export interface DeliveryChoice {
  readonly type: string; // self_pickup, custom, <перевозчик>_<режим>
  readonly carrier: string | null;
  readonly mode: string | null;
  readonly requiresPickupPoint: boolean;
  readonly shipmentRequired: boolean;
  readonly label: string;
  readonly costCents: number;
  readonly tariffCode: string | null;
  readonly customTariffId: string | null;
  readonly pickupPointId: string | null;
  readonly pickupPointKind: string | null;
  readonly periodMin: number | null;
  readonly periodMax: number | null;
}

export interface DeliveryCard {
  readonly option: CheckoutDeliveryOption;
  readonly choice: DeliveryChoice;
}

// Подписи СДЭК — как у пяти тем по умолчанию (CheckoutForm: cdekDoorLabel, cdekPvzLabel, cdekPostamatLabel).
const CDEK_LABELS = { door: 'Курьер СДЭК до двери', pvz: 'Пункт выдачи СДЭК', postamat: 'Постамат СДЭК' } as const;
const PICKUP_LABEL = 'Самовывоз';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const listOf = (source: unknown, key: string): readonly Record<string, unknown>[] => {
  const raw: unknown = isRecord(source) ? source[key] : undefined;
  return Array.isArray(raw) ? raw.filter(isRecord) : [];
};

const money = (cents: number): CheckoutDeliveryOption['price'] => ({ amount: cents, currency: 'RUB' });

function pickupCards(points: readonly Record<string, unknown>[]): DeliveryCard[] {
  const many = points.length > 1;
  return points.map((point, at) => {
    const place = textOf(point.city) || textOf(point.address) || `точка ${at + 1}`;
    const title = many ? `${PICKUP_LABEL} — ${place}` : PICKUP_LABEL;
    const id = textOf(point.id) || String(at + 1);
    return {
      option: {
        id: `pickup:${id}`,
        kind: 'pickup',
        title,
        about: textOf(point.address) || 'Заберите из нашего магазина',
        price: money(0),
        cheapest: false,
        needsPoint: false,
      },
      choice: {
        ...NO_CHOICE,
        type: 'self_pickup',
        mode: 'self_pickup',
        label: title,
        pickupPointId: textOf(point.id) || null,
      },
    };
  });
}

const NO_CHOICE: DeliveryChoice = {
  type: '',
  carrier: null,
  mode: null,
  requiresPickupPoint: false,
  shipmentRequired: false,
  label: '',
  costCents: 0,
  tariffCode: null,
  customTariffId: null,
  pickupPointId: null,
  pickupPointKind: null,
  periodMin: null,
  periodMax: null,
};

const centsOf = (option: Record<string, unknown>): number => Math.round((numberOrNull(option.price) ?? 0) * 100);
const periodOf = (option: Record<string, unknown>): string => {
  const min = numberOrNull(option.minDays);
  const max = numberOrNull(option.maxDays);
  return min === null || max === null ? '' : `от ${min} до ${max} рабочих дней`;
};

function ownCard(option: Record<string, unknown>): DeliveryCard {
  const cents = centsOf(option);
  const id = textOf(option.id);
  const title = textOf(option.name);
  return {
    option: {
      id: `own:${id}`,
      kind: 'own',
      title,
      about: textOf(option.description) || periodOf(option),
      price: money(cents),
      cheapest: false,
      needsPoint: false,
    },
    choice: {
      ...NO_CHOICE,
      type: 'custom',
      mode: textOf(option.mode) || 'own',
      shipmentRequired: option.shipmentRequired === true,
      label: title,
      costCents: cents,
      customTariffId: id || null,
    },
  };
}

// Описание способа перевозчика, если магазин не задал своё: для СДЭК — тексты пяти тем как есть.
function methodAbout(carrier: string, mode: string, kind: string): string {
  if (mode === 'door') return 'Привезём по вашему адресу';
  if (carrier !== 'cdek') return 'Заберёте в пункте выдачи, с сотрудником';
  return kind === 'POSTAMAT' ? 'Ячейка по коду из СМС, круглосуточно' : 'Заберёте в офисе СДЭК, с сотрудником';
}

function carrierTitle(carrier: string, mode: string, kind: string, label: string): string {
  if (carrier !== 'cdek') return label;
  if (mode === 'door') return CDEK_LABELS.door;
  return kind === 'POSTAMAT' ? CDEK_LABELS.postamat : CDEK_LABELS.pvz;
}

// Код тарифа — строкой (общий вид, не только числовые коды СДЭК).
const tariffOf = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value !== '' ? value : null;
};

function carrierChoice(option: Record<string, unknown>, title: string): DeliveryChoice {
  const carrier = textOf(option.carrier);
  const mode = textOf(option.mode);
  return {
    ...NO_CHOICE,
    type: `${carrier}_${mode}`,
    carrier,
    mode,
    requiresPickupPoint: option.requiresPickupPoint === true,
    shipmentRequired: option.shipmentRequired === true,
    label: title,
    costCents: centsOf(option),
    tariffCode: tariffOf(option.tariffCode),
    pickupPointKind: textOf(option.pickupPointKind) || null,
    periodMin: numberOrNull(option.minDays),
    periodMax: numberOrNull(option.maxDays),
  };
}

function carrierCard(option: Record<string, unknown>): DeliveryCard {
  const carrier = textOf(option.carrier);
  const mode = textOf(option.mode);
  const kind = textOf(option.pickupPointKind);
  const period = periodOf(option);
  const about = textOf(option.description) || methodAbout(carrier, mode, kind);
  const title = carrierTitle(carrier, mode, kind, textOf(option.label));
  return {
    option: {
      id: `${carrier}:${mode}:${kind}`,
      kind: 'carrier',
      title,
      about: period === '' ? about : `${about} · ${period}`,
      price: money(centsOf(option)),
      cheapest: false,
      needsPoint: option.requiresPickupPoint === true,
    },
    choice: carrierChoice(option, title),
  };
}

// Лучший из двух вариантов одного способа: цена, потом меньший срок «до», потом «от».
function better(next: DeliveryCard, current: DeliveryCard): boolean {
  const a = next.choice;
  const b = current.choice;
  if (a.costCents !== b.costCents) return a.costCents < b.costCents;
  const amax = a.periodMax ?? Infinity;
  const bmax = b.periodMax ?? Infinity;
  if (amax !== bmax) return amax < bmax;
  return (a.periodMin ?? Infinity) < (b.periodMin ?? Infinity);
}

// Перевозчики — без адреса не показываются (появятся после ввода города).
function carrierCards(options: readonly Record<string, unknown>[], addressKnown: boolean): DeliveryCard[] {
  if (!addressKnown) return [];
  const best = new Map<string, DeliveryCard>();
  for (const option of options.filter((candidate) => textOf(candidate.carrier) !== '')) {
    const card = carrierCard(option);
    const current = best.get(card.option.id);
    if (current === undefined || better(card, current)) best.set(card.option.id, card);
  }
  return [...best.values()];
}

// Карточки ответа расчёта: самовывоз, свои тарифы, перевозчики; по цене; «дешевле всего» — единственной дешёвой платной.
export function deliveryCards(data: unknown, addressKnown: boolean): DeliveryCard[] {
  const options = listOf(data, 'deliveryOptions');
  const cards = [
    ...pickupCards(listOf(data, 'pickupPoints')),
    ...options.filter((option) => textOf(option.carrier) === '').map(ownCard),
    ...carrierCards(options, addressKnown),
  ].sort((a, b) => a.choice.costCents - b.choice.costCents);
  const [first, second] = cards;
  if (first === undefined || second === undefined) return cards;
  const lone = first.choice.costCents > 0 && first.choice.costCents < second.choice.costCents;
  return lone ? [{ ...first, option: { ...first.option, cheapest: true } }, ...cards.slice(1)] : cards;
}

// Почему вариантов нет: товары вне профиля доставки магазина — их названия; ошибка перевозчика; общий текст.
export function emptyMessage(data: unknown, names: ReadonlyMap<string, string>, addressKnown: boolean): string {
  const blocked = listOf(data, 'unavailableProducts')
    .map((item) => textOf(item.productId))
    .filter((id) => id !== '');
  if (blocked.length > 0) {
    const titles = blocked.map((id) => names.get(id)).filter((title) => title !== undefined);
    const list = titles.map((title) => `«${title}»`).join(', ');
    return list === '' ? 'Часть товаров нельзя доставить' : `Не доставляем: ${list}. Уберите их из корзины`;
  }
  if (!addressKnown) return 'Заполните адрес доставки, чтобы увидеть варианты';
  const carrierError = isRecord(data) ? textOf(data.cdekError) : '';
  return carrierError || 'Нет доступных вариантов доставки для этого адреса';
}

// Ответ ещё не окончательный: ни вариантов, ни точек, ни недоставляемых товаров — расчёт повторяют (у свежей корзины
// логистика отвечает пустым списком первые секунды, как у пяти тем).
export const settled = (data: unknown): boolean =>
  listOf(data, 'deliveryOptions').length > 0 ||
  listOf(data, 'pickupPoints').length > 0 ||
  listOf(data, 'unavailableProducts').length > 0;

// Пункты выдачи перевозчика: GET …/delivery/pickup-points → { data: [{ code, name, address, workTime, type }] }.
export function pointsOf(body: unknown, kind: string | null): CheckoutPoint[] {
  const data: unknown = isRecord(body) ? body.data : undefined;
  const list = Array.isArray(data) ? data.filter(isRecord) : [];
  return list
    .filter((point) => kind === null || textOf(point.type) === '' || textOf(point.type) === kind)
    .map((point) => ({
      code: textOf(point.code),
      name: textOf(point.name),
      address: textOf(point.address),
      hours: textOf(point.workTime),
    }))
    .filter((point) => point.code !== '')
    .sort((a, b) => a.address.localeCompare(b.address, 'ru'));
}
