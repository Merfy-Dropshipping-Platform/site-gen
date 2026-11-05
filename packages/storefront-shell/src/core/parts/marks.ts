import { MARKS_PART } from '../roles';
import type { CoreHandle, InstanceHost, ReadableStore, SdkPart, Stop } from '../types';

// Метки без скрипта секции (владелец 06.11: «логика если была поставлена, то работала»): секция ставит только разметку,
// вид по состоянию ведёт эта часть — сердечко favorites.toggle (aria-pressed), счётчики favorites-count и cart-count,
// ссылка data-ref="profile". Скрипт секции может делать то же самое: значения совпадают. Часть вне ядра (бюджет 16 КБ):
// сборка кладёт её в бандл страницы, где такие метки есть в HTML (MARKS_HTML). Подписка — только на стор метки этой
// секции: первая подписка читает список вошедшей и me.

type Live = <T>(mark: string, store: () => ReadableStore<T>, show: (value: T) => void) => void;

const showHearts = (root: HTMLElement, ids: readonly string[]): void => {
  root.querySelectorAll('[data-action*="favorites.toggle"]').forEach((heart) => {
    const id = heart.getAttribute('data-product-id');
    if (id !== null) heart.setAttribute('aria-pressed', String(ids.includes(id)));
  });
};

const showCount = (root: HTMLElement, name: string, count: number, hides: WeakMap<HTMLElement, boolean>): void => {
  root.querySelectorAll<HTMLElement>(`[data-ref="${name}"]`).forEach((badge) => {
    // Скрыт только счётчик, скрытый в разметке: «Корзина (0)» в дизайне секции остаётся на месте.
    if (!hides.has(badge)) hides.set(badge, badge.hidden);
    if (badge.textContent !== String(count)) badge.textContent = String(count); // тот же текст разбудил бы наблюдатель
    if (hides.get(badge) === true) badge.hidden = count === 0;
  });
};

const showProfile = (root: HTMLElement, signedIn: boolean): void => {
  const href = signedIn ? '/account' : '/login';
  root.querySelectorAll('a[data-ref="profile"]').forEach((link) => link.setAttribute('href', href));
};

function watchShop(core: CoreHandle, element: HTMLElement, live: Live): void {
  const hides = new WeakMap<HTMLElement, boolean>();
  live(
    'favorites.toggle',
    () => core.part('favorites').$favorites,
    ({ ids }) => showHearts(element, ids),
  );
  live(
    '"favorites-count"',
    () => core.part('favorites').$count,
    (count) => showCount(element, 'favorites-count', count, hides),
  );
  live(
    '"cart-count"',
    () => core.part('cart').$count,
    (count) => showCount(element, 'cart-count', count, hides),
  );
}

function attachMarks(core: CoreHandle, { element, signal }: InstanceHost): void {
  const html = element.innerHTML; // вместе с содержимым <template>: строки списка появятся позже
  const renders: Array<() => void> = [];
  const stops: Stop[] = [];
  const live: Live = (mark, store, show) => {
    if (!html.includes(mark)) return;
    const source = store();
    const render = (): void => show(source.get());
    stops.push(core.watch(source, render));
    renders.push(render);
    render();
  };
  watchShop(core, element, live);
  // Строки списка появляются позже, data-product-id ставит скрипт секции — наблюдатель видит и то и другое.
  const seen = new MutationObserver(() => renders.forEach((render) => render()));
  seen.observe(element, { childList: true, subtree: true, attributeFilter: ['data-product-id'] });
  // Вход читается при первой подписке: после первого прохода страницы, как в шапке, чтобы me не шёл раньше готовности.
  const later = setTimeout(() => {
    live(
      '"profile"',
      () => core.part('customer').$customer,
      ({ customer }) => showProfile(element, customer !== null),
    );
  }, 0);
  signal.addEventListener('abort', () => {
    clearTimeout(later);
    seen.disconnect();
    stops.forEach((stop) => stop());
  });
}

export const marks: SdkPart<typeof MARKS_PART, CoreHandle> = {
  name: MARKS_PART,
  create: (core) => core,
  attach: attachMarks,
};
