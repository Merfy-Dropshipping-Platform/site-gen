import { createPartStore } from './store';
import type { CartLine, CartPart, CartState } from './types';

// Корзина — шов (С7-4 и С7-8 — потом): строки в памяти страницы. Правда о корзине, серверная корзина и мост к
// оформлению придут с договором SDK; секции уже сейчас берут её через part('cart').
function addLine(lines: readonly CartLine[], productId: string, quantity: number): readonly CartLine[] {
  if (!lines.some((line) => line.productId === productId)) return [...lines, { productId, quantity }];
  return lines.map((line) => (line.productId === productId ? { productId, quantity: line.quantity + quantity } : line));
}

export function createCart(): CartPart {
  const store = createPartStore<CartState>({ lines: [] });
  return {
    get: store.get,
    subscribe: store.subscribe,
    add: (productId, quantity = 1) => store.set({ lines: addLine(store.get().lines, productId, quantity) }),
    remove: (productId) => store.set({ lines: store.get().lines.filter((line) => line.productId !== productId) }),
    count: () => store.get().lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

// Одна корзина на страницу: файл ядра — один модуль на страницу (import map), секции всех авторов видят её же.
export const part = createCart();
