import { afterEach, describe, expect, it, vi } from 'vitest';
import { atom, batch, computed, onMount, readable, watchSource } from '../src/core/stores';

// Сторы ядра на Nano Stores 1.5.4 (блок 9, «Решил сам» пп. 2, 15, 19; замер 18.10 — факт 11 design.md блока 9).
afterEach(() => {
  vi.useRealTimers();
});

// Счётчик корзины: штук в корзине плюс ждущих ответа — как $count блока 9.
function counter() {
  const lines = atom(0);
  const adding = atom(0);
  const count = readable(computed([lines, adding], (inCart, waiting) => inCart + waiting));
  const seen: number[] = [];
  watchSource(count)?.listen((value) => seen.push(value));
  seen.push(count.get());
  return { lines, adding, count, seen };
}

describe('сторы на Nano Stores', () => {
  it('две записи в batch — подписчик счётчика не видит промежуточного значения', () => {
    const { lines, adding, seen } = counter();
    adding.set(2);
    batch(() => {
      lines.set(2);
      adding.set(0);
    });
    expect(seen).toEqual([0, 2]);
  });

  it('без batch — промежуточное значение видно (поэтому ответ сервера пишется в batch)', () => {
    const { lines, adding, seen } = counter();
    adding.set(2);
    lines.set(2);
    adding.set(0);
    expect(seen).toEqual([0, 2, 4, 2]);
  });

  it('set с тем же значением подписчиков не вызывает', () => {
    const value = atom(1);
    const listener = vi.fn();
    value.listen(listener);
    value.set(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it('значение заморожено и после set', () => {
    const cart = atom({ lines: [{ id: 'l1', quantity: 1 }] });
    cart.set({ lines: [{ id: 'l2', quantity: 2 }] });
    expect(Object.isFrozen(cart.get().lines[0])).toBe(true);
  });

  it('подписчик бросил — остальные вызваны, set бросает его ошибку: запись ядра ловит её сама', () => {
    const value = atom(0);
    const after = vi.fn();
    value.listen(() => {
      throw new Error('подписчик сломался');
    });
    value.listen(after);
    expect(() => value.set(1)).toThrow('подписчик сломался');
    expect(after.mock.calls[0]?.[0]).toBe(1);
    expect(value.get()).toBe(1);
  });

  it('onMount — при первой подписке; отключение — через 1 с после отписки последнего', () => {
    vi.useFakeTimers();
    const value = atom(0);
    const log: string[] = [];
    onMount(value, () => {
      log.push('подключён');
      return () => log.push('отключён');
    });
    const stop = watchSource(readable(value))?.listen(() => undefined);
    expect(log).toEqual(['подключён']);
    stop?.();
    vi.advanceTimersByTime(999);
    expect(log).toEqual(['подключён']);
    vi.advanceTimersByTime(1);
    expect(log).toEqual(['подключён', 'отключён']);
  });
});
