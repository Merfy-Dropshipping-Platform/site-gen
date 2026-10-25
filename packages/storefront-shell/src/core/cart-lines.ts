import type { CartLine, CartTotals, Money } from './types';

// Ответы шлюза о корзине (блок 9, часть 9а) → строки $cart. Форма — договор с orders (order_items): id и productId —
// непустые строки, variantCombinationId — непустая строка, null или нет поля, quantity и unitPriceCents — целые от 0.
// Что-то не так — null: витрина показывает покупателю только то, что поняла. Цена строки — Money (Р9а-17).

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

const nonEmptyText = (value: unknown): value is string => typeof value === 'string' && value !== '';

// variantCombinationId: непустая строка — она; null или нет поля — варианта нет; иное — форма не сошлась.
const variantOf = (item: Record<string, unknown>): string | null | undefined => {
  const value: unknown = item.variantCombinationId;
  if (value === undefined || value === null) return null;
  return nonEmptyText(value) ? value : undefined;
};

// Поля показа строки (блок 10, Р10а-1): чего нет — пустое название, без фото и вариантов, сумма — цена × штуки.
const imageOf = (value: unknown): string | null => (nonEmptyText(value) ? value : null);
const isTextEntry = (entry: [string, unknown]): entry is [string, string] => typeof entry[1] === 'string';
const optionsOf = (value: unknown): Readonly<Record<string, string>> =>
  isRecord(value) ? Object.fromEntries(Object.entries(value).filter(isTextEntry)) : {};
const totalOf = (item: Record<string, unknown>, unit: number, quantity: number): number =>
  isCount(item.totalCents) ? item.totalCents : unit * quantity;

// Строка из ответа orders: null — форма не сошлась.
function lineOfItem(item: Record<string, unknown>, currency: string): CartLine | null {
  const variantId = variantOf(item);
  if (!nonEmptyText(item.id)) return null;
  if (!nonEmptyText(item.productId)) return null;
  if (variantId === undefined) return null;
  if (!isCount(item.quantity)) return null;
  if (!isCount(item.unitPriceCents)) return null;
  const price: Money = { amount: item.unitPriceCents, currency };
  const total: Money = { amount: totalOf(item, item.unitPriceCents, item.quantity), currency };
  const title = typeof item.name === 'string' ? item.name : '';
  const shown = {
    title,
    image: imageOf(item.imageUrl),
    options: optionsOf(item.options),
    total,
    gift: item.isBonus === true,
  };
  return { id: item.id, productId: item.productId, variantId, quantity: item.quantity, price, ...shown };
}

// GET …/carts/:id → { cart, items }: одна плохая строка — null целиком.
export function linesOf(body: unknown, currency: string): readonly CartLine[] | null {
  if (!isRecord(body) || !Array.isArray(body.items)) return null;
  const lines: CartLine[] = [];
  for (const item of body.items) {
    if (!isRecord(item)) return null;
    const line = lineOfItem(item, currency);
    if (line === null) return null;
    lines.push(line);
  }
  return lines;
}

// POST …/items → { item }.
export function lineOf(body: unknown, currency: string): CartLine | null {
  if (!isRecord(body) || !isRecord(body.item)) return null;
  return lineOfItem(body.item, currency);
}

// POST /store/carts → { cart: { id } }.
export function cartIdOf(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.cart)) return null;
  return nonEmptyText(body.cart.id) ? body.cart.id : null;
}

// Строка с тем же id заменяется на месте, новая — в конец.
export function withLine(lines: readonly CartLine[], line: CartLine): readonly CartLine[] {
  const known = lines.some((current) => current.id === line.id);
  return known ? lines.map((current) => (current.id === line.id ? line : current)) : [...lines, line];
}

// Итоги из GET …/carts/:id → { cart: { subtotalCents, discountCents, totalCents, promoCode, extensionDiscountCents } }
// (блок 10, Р10а-2): суммы — целые от 0, скидки расширения нет — 0; не по форме — null, прежние итоги остаются.
const AUTO_PREFIX = 'AUTO:';
const discountNameOf = (promo: unknown): string | null =>
  typeof promo === 'string' && promo.startsWith(AUTO_PREFIX) && promo.length > AUTO_PREFIX.length
    ? promo.slice(AUTO_PREFIX.length)
    : null;

export function totalsOf(body: unknown, currency: string): CartTotals | null {
  if (!isRecord(body) || !isRecord(body.cart)) return null;
  const { subtotalCents, discountCents, totalCents, promoCode } = body.cart;
  const extension = body.cart.extensionDiscountCents ?? 0;
  if (!isCount(subtotalCents) || !isCount(discountCents) || !isCount(totalCents) || !isCount(extension)) return null;
  const money = (amount: number): Money => ({ amount, currency });
  return {
    ready: true,
    subtotal: money(subtotalCents),
    discount: money(discountCents),
    discountName: discountNameOf(promoCode),
    extensionDiscount: money(extension),
    total: money(totalCents),
  };
}
