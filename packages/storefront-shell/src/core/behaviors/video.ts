import type { Behavior, BehaviorHost, BehaviorInstance } from './types';

// Видео (design.md блока 6, раздел 8): кнопка «Смотреть» переключает воспроизведение, скрывается при play,
// снова видна при pause и ended. Отказ play() — молча: в превью автозапуск запрещён.

export const video: Behavior<'video'> = {
  name: 'video',
  attach(host: BehaviorHost): BehaviorInstance {
    const media = host.root.querySelector('[data-part="video"]');
    const play = host.root.querySelector<HTMLElement>('[data-part="play"]');
    if (!(media instanceof HTMLMediaElement) || play === null) return {};
    const show = (visible: boolean): void => {
      play.toggleAttribute('hidden', !visible);
    };
    play.addEventListener(
      'click',
      () => {
        if (media.paused) void media.play().catch(() => undefined);
        else media.pause();
      },
      { signal: host.signal },
    );
    media.addEventListener('play', () => show(false), { signal: host.signal });
    media.addEventListener('pause', () => show(true), { signal: host.signal });
    media.addEventListener('ended', () => show(true), { signal: host.signal });
    return {};
  },
};
