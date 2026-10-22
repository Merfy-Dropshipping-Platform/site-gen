import { atom as nanoAtom, type WritableAtom } from 'nanostores';
import { deepFreeze } from './freeze';
import type { ReadableStore, Stop } from './types';

// Сторы ядра (design.md блока 5, раздел 3.2; блок 9, «Решил сам» пп. 2, 14, 19) — Nano Stores 1.5.4. Секции получают
// только фасад { get }, подписка — только ctx.watch (ядро находит источник фасада). Значения заморожены: секция их только
// читает. Подписчики вызываются синхронно в set по порядку подписки; set с тем же значением (Object.is) их не вызывает;
// batch откладывает уведомления до конца — счётчик из двух сторов не показывает промежуточное значение.
export { batch, computed, onMount } from 'nanostores';

export interface WatchSource<T> {
  get(): T;
  listen(fn: (value: T) => void): Stop;
}

export type Atom<T> = WritableAtom<T>;

// Атом Nano Stores, который замораживает значение и в начале, и в каждом set.
export function atom<T>(initial: T): Atom<T> {
  const store = nanoAtom<T>(deepFreeze(initial));
  const write = store.set.bind(store);
  store.set = (next: T): void => write(deepFreeze(next));
  return store;
}

// Источник в стёртом виде: подписка с уведомлением, значение подписчик читает сам из своего фасада (store.get(): T) —
// так WeakMap модуля хранит источник любого T без приведения типов.
interface ErasedSource {
  listen(fn: () => void): Stop;
}

const sources = new WeakMap<object, ErasedSource>();

// Фасад стора для секций: только get, заморожен. Подписка источника хранится по фасаду в WeakMap модуля.
export function readable<T>(source: WatchSource<T>): ReadableStore<T> {
  const facade: ReadableStore<T> = Object.freeze({ get: (): T => source.get() });
  sources.set(facade, { listen: (fn) => source.listen(() => fn()) });
  return facade;
}

// Источник фасада: только для фасадов из readable — ядро подписывает их в ctx.watch. Чужой объект — null.
export function watchSource<T>(store: ReadableStore<T>): WatchSource<T> | null {
  const erased = sources.get(store);
  if (erased === undefined) return null;
  return {
    get: (): T => store.get(),
    listen: (fn: (value: T) => void): Stop => erased.listen(() => fn(store.get())),
  };
}
