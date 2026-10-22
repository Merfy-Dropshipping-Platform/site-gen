import { checkAttributeWrite } from '../attributes';
import type { Behavior, BehaviorHost, BehaviorInstance } from './types';

// Фото карточки (design.md блока 6, раздел 8; Р6-15): мышь — второе фото при наведении, телефон — свайп от 30 px
// по горизонтали (в 1,5 раза больше, чем по вертикали), после свайпа нажатие 400 мс гасится. Адрес проходит ту же
// границу, что и El.attr('img', 'src'); неверные адреса выпадают из списка, листание не переходит с последнего
// фото на первое.

const SWIPE_MIN_PX = 30;
const SWIPE_RATIO = 1.5;
const CLICK_SUPPRESS_MS = 400;

const partOf = (host: BehaviorHost, name: string): HTMLElement | null =>
  host.root.querySelector<HTMLElement>(`[data-part="${name}"]`);

// Граница src картинки: адрес, который её не проходит, из списка выпадает.
function safePhotos(photos: readonly string[]): readonly string[] {
  return photos.filter((photo) => {
    try {
      checkAttributeWrite('img', 'src', photo);
      return true;
    } catch {
      return false;
    }
  });
}

interface Swipe {
  x: number;
  y: number;
}

// Свайп пальцем: pointerdown — старт, pointerup — сдвиг; решает nextBySwipe, применяет apply.
function listenSwipe(
  host: BehaviorHost,
  nextBySwipe: (from: Swipe, to: Swipe) => number | null,
  apply: (target: number) => void,
): void {
  let start: Swipe | null = null;
  host.root.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType === 'mouse') return;
      start = { x: event.clientX, y: event.clientY };
    },
    { signal: host.signal },
  );
  host.root.addEventListener(
    'pointerup',
    (event) => {
      if (start === null) return;
      const target = nextBySwipe(start, { x: event.clientX, y: event.clientY });
      start = null;
      if (target !== null) apply(target);
    },
    { signal: host.signal },
  );
}

// Смена по наведению — только мышь (pointerType: 'mouse').
function listenHover(host: BehaviorHost, show: (index: number) => void): void {
  const isMouse = (event: Event): boolean => event instanceof PointerEvent && event.pointerType === 'mouse';
  host.root.addEventListener(
    'pointerenter',
    (event) => {
      if (isMouse(event)) show(1);
    },
    { signal: host.signal },
  );
  host.root.addEventListener(
    'pointerleave',
    (event) => {
      if (isMouse(event)) show(0);
    },
    { signal: host.signal },
  );
}

// После свайпа нажатие на карточку 400 мс гасится: перехват на фазе перехвата.
function listenClickSuppress(host: BehaviorHost, suppressed: () => boolean): void {
  host.root.addEventListener(
    'click',
    (event) => {
      if (!suppressed()) return;
      event.preventDefault();
      event.stopPropagation();
    },
    { capture: true, signal: host.signal },
  );
}

export const cardPhotos: Behavior<'card-photos'> = {
  name: 'card-photos',
  attach(host: BehaviorHost): BehaviorInstance {
    const photos = safePhotos(host.params.photos instanceof Array ? host.params.photos : []);
    const image = partOf(host, 'image');
    if (image === null || photos.length < 2) return {};
    let at = 0;
    let suppressedUntil = 0;
    const show = (index: number): void => {
      at = index;
      image.setAttribute('src', photos[at] ?? photos[0] ?? '');
    };

    const nextBySwipe = (from: Swipe, to: Swipe): number | null => {
      const dx = Math.abs(to.x - from.x);
      const dy = Math.abs(to.y - from.y);
      if (dx < SWIPE_MIN_PX || dx < dy * SWIPE_RATIO) return null;
      return to.x < from.x ? at + 1 : at - 1;
    };

    listenSwipe(host, nextBySwipe, (target) => {
      if (target < 0 || target >= photos.length) return;
      suppressedUntil = performance.now() + CLICK_SUPPRESS_MS;
      show(target);
    });

    if (host.params['hover-next'] !== false) listenHover(host, show);
    listenClickSuppress(host, () => performance.now() < suppressedUntil);
    return {};
  },
};
