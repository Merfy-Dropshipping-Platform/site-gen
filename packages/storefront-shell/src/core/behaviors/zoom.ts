import type { Behavior, BehaviorHost, BehaviorInstance } from './types';
import { safePhotos } from './photos';

// Увеличение фото товара (блок 15, часть 15в, Р15в-3; design.md блока 6, раздел 8): на проде — wireGalleryZoom и
// openLightbox у Product theme-base. hover — scale(2), точка увеличения под курсором (только мышь); click — окно
// <dialog> с фото, лентой миниатюр и «Закрыть»: ←/→ листают без перехода с последнего на первое, Escape и клик по
// фону закрывают, фокус возвращается на рамку. Окно строит само поведение — разметки в секции нет. Библиотек нет:
// появление окна — Element.animate, при «уменьшить движение» — сразу.

const imageOf = (host: BehaviorHost): HTMLElement | null => host.root.querySelector<HTMLElement>('[data-part="image"]');

// Элемент окна с атрибутами и стилем — окно строит поведение, разметки в секции нет.
function styled<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: string,
  attrs: Record<string, string>,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.setAttribute('style', style);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

// Точка увеличения под курсором: целые проценты внутри рамки — transform-origin.
function originOf(root: HTMLElement, event: PointerEvent): string {
  const box = root.getBoundingClientRect();
  const percent = (offset: number, size: number): number => (size === 0 ? 50 : Math.round((offset / size) * 100));
  return `${percent(event.clientX - box.left, box.width)}% ${percent(event.clientY - box.top, box.height)}%`;
}

// Лупа при наведении — только мышь: enter увеличивает, move держит точку под курсором, leave возвращает исходный вид.
function attachHover(host: BehaviorHost, image: HTMLElement): void {
  const isMouse = (event: Event): event is PointerEvent =>
    event instanceof PointerEvent && event.pointerType === 'mouse';
  // enter и move — одно действие: увеличить и держать точку под курсором.
  const magnify = (event: Event): void => {
    if (!isMouse(event)) return;
    image.style.transform = 'scale(2)';
    image.style.transformOrigin = originOf(host.root, event);
  };
  const reset = (event: Event): void => {
    if (!isMouse(event)) return;
    image.style.transform = '';
    image.style.transformOrigin = '';
  };
  host.root.style.cursor = 'zoom-in';
  if (!host.motion.reduced) image.style.transition = 'transform .2s ease, transform-origin .05s linear';
  host.root.addEventListener('pointerenter', magnify, { signal: host.signal });
  host.root.addEventListener('pointermove', magnify, { signal: host.signal });
  host.root.addEventListener('pointerleave', reset, { signal: host.signal });
}

interface ZoomDialog {
  readonly dialog: HTMLDialogElement;
  readonly main: HTMLImageElement;
  readonly thumbs: readonly HTMLButtonElement[];
}

// Текущее фото — в главное окно и aria-current миниатюры.
function showPhoto(view: ZoomDialog, photos: readonly string[], at: number): void {
  view.main.setAttribute('src', photos[at]);
  view.thumbs.forEach((thumb, index) => thumb.setAttribute('aria-current', index === at ? 'true' : 'false'));
}

// Лента миниатюр: кнопка на каждое фото; одного фото — ленты нет.
function buildDialog(photos: readonly string[], at: number): ZoomDialog {
  const dialog = styled(
    'dialog',
    'background:#000c;border:0;padding:16px;width:100vw;height:100vh;display:flex;flex-wrap:wrap;place-content:center;align-items:center;gap:8px',
    { 'data-zoom-dialog': '', 'aria-label': 'Фото товара' },
  );
  const close = styled(
    'button',
    'position:absolute;top:16px;right:16px;color:#fff;background:none;border:0;font-size:20px',
    { 'data-zoom-close': '', 'aria-label': 'Закрыть' },
  );
  close.textContent = '×';
  const main = styled('img', 'max-width:100%;max-height:calc(100vh - 200px)', {
    'data-zoom-main': '',
    src: photos[at],
  });
  dialog.append(close, main);
  if (photos.length < 2) return { dialog, main, thumbs: [] };
  const thumbs = photos.map((photo, index) => {
    const thumb = styled('button', 'width:80px;height:80px;border:0', {
      'data-zoom-thumb': '',
      'aria-label': `Фото ${index + 1} из ${photos.length}`,
      'aria-current': index === at ? 'true' : 'false',
    });
    thumb.append(styled('img', 'width:100%;height:100%', { src: photo }));
    dialog.append(thumb);
    return thumb;
  });
  return { dialog, main, thumbs };
}

// Окно: showModal, проявление 150 мс ease-out (при «уменьшить движение» — сразу), ←/→ без перехода с последнего
// на первое, миниатюра и «Закрыть», клик по фону; close (и Escape) убирает окно и возвращает фокус на рамку.
// Окно открывается на фото, которое сейчас в рамке: его адрес в списке — его место, нет — он первым (как openLightbox).
function openDialog(host: BehaviorHost, photos: readonly string[], current: string): void {
  const found = photos.indexOf(current);
  const list = found >= 0 ? photos : [current, ...photos];
  const start = found >= 0 ? found : 0;
  const view = buildDialog(list, start);
  let at = start;
  const turn = (step: number): void => {
    const next = at + step;
    if (next < 0 || next >= list.length) return;
    at = next;
    showPhoto(view, list, at);
  };
  view.dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') turn(1);
    if (event.key === 'ArrowLeft') turn(-1);
  });
  // Закрытие — синхронно: окно сразу уходит из документа и фокус возвращается на рамку (close-событие — асинхронно).
  const shut = (): void => {
    view.dialog.close();
    view.dialog.remove();
    host.root.focus();
  };
  view.dialog.addEventListener('click', (event) => {
    const target = event.target;
    if (target === view.dialog) return shut();
    // Клик может попасть в картинку миниатюры — ищем её кнопку.
    const button = target instanceof Element ? target.closest('button') : null;
    if (!(button instanceof HTMLButtonElement)) return;
    if (button.hasAttribute('data-zoom-close')) return shut();
    const thumbAt = view.thumbs.indexOf(button);
    if (thumbAt >= 0) {
      at = thumbAt;
      showPhoto(view, list, at);
    }
  });
  view.dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    shut();
  });
  host.signal.addEventListener('abort', shut);
  document.body.append(view.dialog);
  view.dialog.showModal();
  if (!host.motion.reduced) view.dialog.animate({ opacity: [0, 1] }, { duration: 150, easing: 'ease-out' });
}

// Окно по нажатию: рамка — кнопка «Увеличить фото», открывают click, Enter и Space.
function attachClick(host: BehaviorHost, photos: readonly string[]): void {
  host.root.setAttribute('role', 'button');
  host.root.setAttribute('tabindex', '0');
  host.root.setAttribute('aria-label', 'Увеличить фото');
  const open = (): void => {
    openDialog(host, photos, imageOf(host)?.getAttribute('src') ?? '');
  };
  host.root.addEventListener('click', open, { signal: host.signal });
  host.root.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open();
    },
    { signal: host.signal },
  );
}

export const zoom: Behavior<'zoom'> = {
  name: 'zoom',
  attach(host: BehaviorHost): BehaviorInstance {
    const photos = safePhotos(host.params.photos instanceof Array ? host.params.photos : []);
    const image = imageOf(host);
    if (image === null) return {};
    if (host.params.mode === 'click') attachClick(host, photos);
    else attachHover(host, image);
    return {};
  },
};
