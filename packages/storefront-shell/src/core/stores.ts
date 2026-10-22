import { deepFreeze } from './freeze';
import type { ReadableStore, Stop } from './types';

// Сторы для секций (design.md блока 5, раздел 3.2; Р5а-7): секции читают значения и подписываются только через
// ctx.watch, поэтому наружу отдаётся фасад { get }. Внутри ядра — atom с синхронными подписчиками по порядку подписки,
// как listen у Nano Stores; блок 9 заменит atom на Nano Stores, фасад и ctx.watch не изменятся.

export interface WatchSource<T> {
  get(): T;
  listen(fn: (value: T) => void): Stop;
}

export interface Atom<T> extends WatchSource<T> {
  set(next: T): void;
}

// Источник в стёртом виде: подписка с уведомлением, значение подписчик читает сам из своего фасада (store.get(): T) —
// так WeakMap модуля хранит источник любого T без приведения типов.
interface ErasedSource {
  listen(fn: (value: unknown) => void): Stop;
}

const sources = new WeakMap<object, ErasedSource>();

export function atom<T>(initial: T): Atom<T> {
  let value = deepFreeze(initial);
  const listeners: Array<(next: T) => void> = [];
  const stopOf =
    (fn: (next: T) => void): Stop =>
    () => {
      const at = listeners.indexOf(fn);
      if (at >= 0) listeners.splice(at, 1);
    };
  return {
    get: () => value,
    listen(fn: (next: T) => void): Stop {
      listeners.push(fn);
      return stopOf(fn);
    },
    set(next: T): void {
      value = deepFreeze(next);
      [...listeners].forEach((fn) => fn(value));
    },
  };
}

// Фасад стора для секций: только get, заморожен. Подписка источника хранится по фасаду в WeakMap модуля.
export function readable<T>(source: WatchSource<T>): ReadableStore<T> {
  const facade: ReadableStore<T> = Object.freeze({
    get: (): T => source.get(),
  });
  const erased: ErasedSource = {
    listen(fn) {
      return source.listen(fn);
    },
  };
  sources.set(facade, erased);
  return facade;
}

// Источник фасада: только для фасадов из readable — ядро подписывает их в ctx.watch. Уведомление приходит от источника,
// значение подписчик читает из своего фасада — тот же источник в тот же миг. Чужой объект — null.
export function watchSource<T>(store: ReadableStore<T>): WatchSource<T> | null {
  const erased = sources.get(store);
  if (erased === undefined) return null;
  return {
    get: (): T => store.get(),
    listen(fn: (value: T) => void): Stop {
      return erased.listen(() => fn(store.get()));
    },
  };
}
