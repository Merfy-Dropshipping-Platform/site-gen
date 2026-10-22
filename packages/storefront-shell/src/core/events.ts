import { deepFreeze } from './freeze';
import type { Stop } from './types';

// Шина событий ядра (design.md блока 5, разделы 3.2 и 3.6; Р5а-5): подписки секций держит ядро, копия каждого события
// уходит на document для кода платформы. Ошибки подписчиков шина не ловит: их относится к экземпляру предохранитель.

export const SECTION_FAILURE_EVENT = 'merfy:section:error';

export interface EventBus {
  emit(name: string, detail: unknown): void;
  listen(name: string, owner: object, fn: (detail: unknown) => void): Stop;
  deliver(owner: object, name: string, detail: unknown): void;
}

interface Subscription {
  readonly owner: object;
  readonly fn: (detail: unknown) => void;
}

// Копия detail через JSON (нет detail — null), замороженная: подписчик не меняет данные события.
const copyOf = (detail: unknown): unknown => {
  const parsed: unknown = JSON.parse(JSON.stringify(detail ?? null));
  return deepFreeze(parsed);
};

export function createEventBus(doc: Document): EventBus {
  const byName = new Map<string, Subscription[]>();

  const stopOf =
    (list: Subscription[], subscription: Subscription): Stop =>
    () => {
      const at = list.indexOf(subscription);
      if (at >= 0) list.splice(at, 1);
    };

  return {
    emit(name: string, detail: unknown): void {
      const copy = copyOf(detail);
      const subscribers = byName.get(name) ?? [];
      subscribers.forEach(({ fn }) => fn(copy));
      doc.dispatchEvent(new CustomEvent(name, { detail: copy }));
    },
    listen(name: string, owner: object, fn: (detail: unknown) => void): Stop {
      const list = byName.get(name) ?? [];
      const subscription: Subscription = { owner, fn };
      list.push(subscription);
      byName.set(name, list);
      return stopOf(list, subscription);
    },
    deliver(owner: object, name: string, detail: unknown): void {
      const copy = copyOf(detail);
      (byName.get(name) ?? []).forEach((subscription) => {
        if (subscription.owner === owner) subscription.fn(copy);
      });
    },
  };
}
