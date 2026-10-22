import { afterEach, describe, expect, it } from 'vitest';
import { createEventBus } from '../src/core/events';
import { atom, readable, watchSource } from '../src/core/stores';

// События ядра и сторы для секций (design.md блока 5, разделы 3.2 и 3.6; «Решил сам» блока 9, пп. 12 и 14).
const recorded: string[] = [];
const record = (event: Event): void => {
  recorded.push(`document ${event.type} ${event instanceof CustomEvent ? JSON.stringify(event.detail) : ''}`);
};

afterEach(() => {
  recorded.length = 0;
  document.removeEventListener('merfy:page:view', record);
});

describe('события', () => {
  it('сначала подписчики секций по порядку подписки, потом копия CustomEvent на document', () => {
    const bus = createEventBus(document);
    document.addEventListener('merfy:page:view', record);
    bus.listen('merfy:page:view', {}, (detail) => recorded.push(`первая ${JSON.stringify(detail)}`));
    bus.listen('merfy:page:view', {}, (detail) => recorded.push(`вторая ${JSON.stringify(detail)}`));
    bus.emit('merfy:page:view', { path: '/' });
    expect(recorded).toEqual(['первая {"path":"/"}', 'вторая {"path":"/"}', 'document merfy:page:view {"path":"/"}']);
  });

  it('detail — замороженная копия: правка исходного объекта после emit подписчику не видна', () => {
    const bus = createEventBus(document);
    const seen: unknown[] = [];
    bus.listen('shop:scarf-match:coat-picked', {}, (detail) => seen.push(detail));
    const detail = { coat: 'grey' };
    bus.emit('shop:scarf-match:coat-picked', detail);
    detail.coat = 'black';
    expect(seen).toEqual([{ coat: 'grey' }]);
    expect(Object.isFrozen(seen[0])).toBe(true);
  });

  it('deliver — только подписчикам одного владельца и без копии на document (новый экземпляр в превью)', () => {
    const bus = createEventBus(document);
    const late = {};
    document.addEventListener('merfy:page:view', record);
    bus.listen('merfy:page:view', {}, () => recorded.push('старый'));
    bus.listen('merfy:page:view', late, () => recorded.push('новый'));
    bus.deliver(late, 'merfy:page:view', { path: '/' });
    expect(recorded).toEqual(['новый']);
  });

  it('Stop снимает подписку', () => {
    const bus = createEventBus(document);
    const stop = bus.listen('merfy:page:ready', {}, () => recorded.push('ready'));
    stop();
    bus.emit('merfy:page:ready', {});
    expect(recorded).toEqual([]);
  });
});

describe('сторы для секций', () => {
  it('фасад стора — только get(); ядро находит по фасаду подписку', () => {
    const count = atom(0);
    const facade = readable(count);
    const seen: number[] = [];
    expect(Object.keys(facade)).toEqual(['get']);
    expect(Object.isFrozen(facade)).toBe(true);
    const stop = watchSource(facade)?.listen((value) => seen.push(value));
    count.set(2);
    stop?.();
    count.set(3);
    expect(seen).toEqual([2]);
    expect(facade.get()).toBe(3);
  });

  it('подписчики стора — синхронно в set, по порядку подписки (как у Nano Stores)', () => {
    const count = atom(0);
    const order: string[] = [];
    count.listen((value) => order.push(`первый ${value}`));
    count.listen((value) => order.push(`второй ${value}`));
    count.set(1);
    expect(order).toEqual(['первый 1', 'второй 1']);
  });

  it('значение стора заморожено', () => {
    const cart = atom({ lines: [{ id: 'p12', quantity: 1 }] });
    expect(Object.isFrozen(readable(cart).get().lines[0])).toBe(true);
  });

  it('объект не из SDK — подписки нет', () => {
    expect(watchSource({ get: () => 1 })).toBeNull();
  });
});
