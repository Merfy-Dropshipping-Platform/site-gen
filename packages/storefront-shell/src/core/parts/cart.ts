import { atom, readable } from '../stores';
import type { CartLine, CartModule, CartState, Result, SdkPart } from '../types';

// Корзина в новом виде (design.md блока 5, раздел 3.12; каталог блока 10): сторы { get } и действия с Result. Данные —
// в памяти страницы до блока 10; id строки — productId или productId:variantId.

const countOf = (lines: readonly CartLine[]): number => lines.reduce((total, line) => total + line.quantity, 0);

const lineIdOf = (productId: string, variantId?: string): string =>
  variantId === undefined ? productId : `${productId}:${variantId}`;

const withAdded = (
  lines: readonly CartLine[],
  id: string,
  productId: string,
  variantId: string | null,
  quantity: number,
): readonly CartLine[] => {
  const existing = lines.find((line) => line.id === id);
  if (existing === undefined) return [...lines, { id, productId, variantId, quantity }];
  return lines.map((line) => (line.id === id ? { ...line, quantity: line.quantity + quantity } : line));
};

const invalid = (message: string): Result<never> => ({ ok: false, error: { code: 'invalid', message } });

interface CartArgs {
  readonly productId: string;
  readonly variantId?: string;
  readonly quantity?: number;
}

type Commit = (lines: readonly CartLine[]) => CartState;

function addLines(commit: Commit, current: () => readonly CartLine[], args: CartArgs): Result<CartState> {
  const quantity = args.quantity ?? 1;
  if (args.productId === '') return invalid('cart.add: productId — непустая строка');
  if (!Number.isInteger(quantity) || quantity < 1) return invalid('cart.add: quantity — целое число от 1');
  const id = lineIdOf(args.productId, args.variantId);
  const lines = withAdded(current(), id, args.productId, args.variantId ?? null, quantity);
  return { ok: true, data: commit(lines) };
}

function removeLine(commit: Commit, current: () => readonly CartLine[], lineId: string): Result<CartState> {
  const lines = current();
  if (!lines.some((line) => line.id === lineId)) return invalid(`cart.remove: строки ${lineId} нет`);
  return { ok: true, data: commit(lines.filter((line) => line.id !== lineId)) };
}

const quantityFrom = (value: string | undefined): number | undefined =>
  value === undefined ? undefined : Number(value);

export const cart: SdkPart<'cart', CartModule> = {
  name: 'cart',
  create: (): CartModule => {
    const state = atom<CartState>({ ready: true, lines: [] });
    const count = atom(0);
    const commit: Commit = (lines) => {
      const next: CartState = { ready: true, lines };
      state.set(next);
      count.set(countOf(lines));
      return next;
    };
    const current = (): readonly CartLine[] => state.get().lines;
    return {
      $cart: readable(state),
      $count: readable(count),
      add: (args: CartArgs): Promise<Result<CartState>> => Promise.resolve(addLines(commit, current, args)),
      remove: (args: { readonly lineId: string }): Promise<Result<CartState>> =>
        Promise.resolve(removeLine(commit, current, args.lineId)),
    };
  },
  markup: {
    add: {
      params: ['product-id', 'variant-id', 'quantity'],
      call: (api: CartModule, values): Promise<Result<unknown>> =>
        api.add({
          productId: values['product-id'] ?? '',
          variantId: values['variant-id'],
          quantity: quantityFrom(values.quantity),
        }),
    },
    remove: {
      params: ['line-id'],
      call: (api: CartModule, values): Promise<Result<unknown>> => api.remove({ lineId: values['line-id'] ?? '' }),
    },
  },
};
