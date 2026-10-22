import type { CartLine, Money } from './types';

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

// Строка из ответа orders: null — форма не сошлась.
function lineOfItem(item: Record<string, unknown>, currency: string): CartLine | null {
  const variantId = variantOf(item);
  if (!nonEmptyText(item.id)) return null;
  if (!nonEmptyText(item.productId)) return null;
  if (variantId === undefined) return null;
  if (!isCount(item.quantity)) return null;
  if (!isCount(item.unitPriceCents)) return null;
  const price: Money = { amount: item.unitPriceCents, currency };
  return { id: item.id, productId: item.productId, variantId, quantity: item.quantity, price };
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
