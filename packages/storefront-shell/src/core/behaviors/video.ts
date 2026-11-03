import { done } from './command';
import type { Behavior, BehaviorHost, BehaviorInstance } from './types';

// Видео (design.md блока 6, раздел 8): кнопка «Смотреть» переключает воспроизведение, скрывается при play,
// снова видна при pause и ended. Отказ play() — молча: в превью автозапуск запрещён. Команды скрипта секции
// (ctx.behavior("video"), 03.11) — play и pause: работают и без кнопки, отказ браузера play() — тоже молча.

const startOf = (media: HTMLMediaElement) => (): void => void media.play().catch(() => undefined);

function listenButton(host: BehaviorHost, media: HTMLMediaElement, play: HTMLElement): void {
  const show = (visible: boolean): void => {
    play.toggleAttribute('hidden', !visible);
  };
  const start = startOf(media);
  play.addEventListener(
    'click',
    () => {
      if (media.paused) start();
      else media.pause();
    },
    { signal: host.signal },
  );
  media.addEventListener('play', () => show(false), { signal: host.signal });
  media.addEventListener('pause', () => show(true), { signal: host.signal });
  media.addEventListener('ended', () => show(true), { signal: host.signal });
}

export const video: Behavior<'video'> = {
  name: 'video',
  attach(host: BehaviorHost): BehaviorInstance {
    const media = host.root.querySelector('[data-part="video"]');
    const play = host.root.querySelector<HTMLElement>('[data-part="play"]');
    if (!(media instanceof HTMLMediaElement)) return {};
    const start = startOf(media);
    if (play !== null) listenButton(host, media, play);
    return {
      commands: {
        play: () => {
          start();
          return done();
        },
        pause: () => {
          media.pause();
          return done();
        },
      },
    };
  },
};
