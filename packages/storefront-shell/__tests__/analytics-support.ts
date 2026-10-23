import type { CartFeed, CartState } from '../src/core/analytics/cart';

// Корзина для тестов модуля аналитики — как корзина старого ядра (блок 7): строки в памяти, подписчик сразу получает
// текущее состояние, каждую правку — отдельной микрозадачей. Модулю аналитики нужна только подписка (CartFeed).
export interface FakeCart extends CartFeed {
  add(productId: string, quantity?: number): void;
  remove(productId: string): void;
}

type Line = CartState['lines'][number];

function addLine(lines: readonly Line[], productId: string, quantity: number): Line[] {
  if (!lines.some((line) => line.productId === productId)) return [...lines, { productId, quantity }];
  return lines.map((line) => (line.productId === productId ? { productId, quantity: line.quantity + quantity } : line));
}

export function fakeCart(): FakeCart {
  let state: CartState = { lines: [] };
  const listeners = new Set<(next: CartState) => void>();
  const deliver = (listener: (next: CartState) => void, next: CartState): void => {
    if (listeners.has(listener)) listener(next);
  };
  const set = (next: CartState): void => {
    state = next;
    listeners.forEach((listener) => queueMicrotask(() => deliver(listener, next)));
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => void listeners.delete(listener);
    },
    add: (productId, quantity = 1) => set({ lines: addLine(state.lines, productId, quantity) }),
    remove: (productId) => set({ lines: state.lines.filter((line) => line.productId !== productId) }),
  };
}
