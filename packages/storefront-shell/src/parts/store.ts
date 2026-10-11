import type { Listener, Unsubscribe } from './types';

// Значение части и подписка. Подписчик сразу получает текущее значение, каждую правку — отдельной микрозадачей: сбой
// одного подписчика (кода секции) не мешает остальным, ошибку ловит ядро по стеку (sources.ts).
export interface PartStore<T> {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: Listener<T>) => Unsubscribe;
}

export function createPartStore<T>(initial: T): PartStore<T> {
  let value = initial;
  const listeners = new Set<Listener<T>>();
  const deliver = (listener: Listener<T>, next: T): void => {
    if (listeners.has(listener)) listener(next);
  };
  return {
    get: () => value,
    set: (next) => {
      value = next;
      listeners.forEach((listener) => queueMicrotask(() => deliver(listener, next)));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      listener(value);
      return () => void listeners.delete(listener);
    },
  };
}
