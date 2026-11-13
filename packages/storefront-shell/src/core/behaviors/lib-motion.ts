import { animate, stagger } from 'motion';
import { checkKeyframes } from '../keyframes';
import type {
  AnimateOptions,
  El,
  KeyframeValue,
  Keyframes,
  MotionLib,
  Playback,
  TimelineAt,
  TimelineSegment,
  TweenOptions,
} from '../types';
import { EASINGS } from './catalog';
import { scrubs } from './scrub';
import type { LibAdapter, MotionHost, SectionHost } from './types';

// Адаптер полного Motion — ctx.lib.motion (13.11, часть 2в спеки анимаций; каталог — libraries.ts). Правила те же, что у
// ctx.animate: только элементы своей секции, кадры — checkKeyframes (любое свойство, значение без адресов и выхода из
// значения; CSS-переменные — любые, регистрировать не нужно), мс на входе, «уменьшить движение» и запуск в превью после правки
// настроек или текста (prefs.ts, still) — сразу последний кадр, снятие секции — остановка. Таймлайн и анимацию ctx.scroll крутит прокруткой (scrub.ts).

type Controls = ReturnType<typeof animate>;
type Transition = NonNullable<Parameters<typeof animate>[2]>;
type Frames = Record<string, KeyframeValue | KeyframeValue[]>;

const invalid = (text: string): Error => Object.assign(new Error(text), { code: 'sdk-call-invalid' });
const ms = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value / 1000 : fallback / 1000;

function ownNodes(host: SectionHost, call: string, el: El | readonly El[]): Element[] {
  return [el].flat().map((item) => {
    const node = host.scope.nodeOf(item);
    if (node === null) throw invalid(`ctx.lib.motion.${call}: элемент не из этой секции`);
    return node;
  });
}

// Кадры: проверка SDK и копия массивов (Motion меняет переданные массивы на месте).
function framesOf(keyframes: Keyframes): Frames {
  checkKeyframes(keyframes);
  const copy: Frames = {};
  for (const [name, value] of Object.entries(keyframes)) copy[name] = typeof value === 'object' ? [...value] : value;
  return copy;
}

// Длительность и кривая: мс → с, кривая по имени или Безье, пружина (bounce 0…0.95, по умолчанию 0.25).
function easingOf(options: AnimateOptions | TweenOptions | undefined) {
  const easing = options?.easing;
  if (typeof easing === 'object' && 'spring' in easing) {
    const bounce = Math.min(Math.max(easing.spring.bounce ?? 0.25, 0), 0.95);
    return { type: 'spring' as const, bounce, duration: ms(easing.spring.duration, options?.duration ?? 600) };
  }
  const ease = typeof easing === 'string' ? EASINGS[easing] : easing;
  const bezier: [number, number, number, number] | undefined = ease === undefined ? undefined : [...ease];
  return { duration: ms(options?.duration, 300), ...(bezier === undefined ? {} : { ease: bezier }) };
}

// Параметры Motion для элементов: кривая, задержка, повтор, stagger (мс) для списка.
function transitionOf(options: AnimateOptions | undefined): Transition {
  const between = ms(options?.stagger, 0);
  const delay = ms(options?.delay, 0);
  const repeat = options?.repeat;
  return {
    ...easingOf(options),
    delay: between > 0 ? stagger(between, { startDelay: delay }) : delay,
    ...(typeof repeat === 'number' && repeat >= 0 ? { repeat } : {}),
    ...(options?.repeatType === 'reverse' ? { repeatType: 'reverse' as const } : {}),
  };
}

// Начало сегмента: мс → с; '<' — как есть; '+200' и '-200' — со знаком в секундах.
function atOf(at: TimelineAt | undefined): number | '<' | `+${number}` | `-${number}` | undefined {
  if (at === undefined || at === '<') return at;
  if (typeof at === 'number' && Number.isFinite(at) && at >= 0) return at / 1000;
  if (typeof at === 'string' && /^[+-]\d+(\.\d+)?$/.test(at)) {
    const value = Number(at.slice(1)) / 1000;
    return at.startsWith('+') ? `+${value}` : `-${value}`;
  }
  throw invalid("ctx.lib.motion.timeline: at — мс от начала, '<', '+мс' или '-мс'");
}

// Открытый объект анимации: finished по концу и по stop, time в мс; снятие секции — stop. Превью и «уменьшить движение» —
// сразу последний кадр.
function stopOf(host: SectionHost, controls: Controls): { finished: Promise<void>; stop: () => void } {
  let settle: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    settle = resolve;
  });
  controls.finished.then(
    () => settle(),
    () => settle(),
  );
  const stop = (): void => {
    controls.stop();
    settle();
  };
  host.signal.addEventListener('abort', stop, { once: true });
  return { finished, stop };
}

function playbackOf(host: MotionHost, controls: Controls): Playback {
  if (host.still()) controls.complete();
  const { finished, stop } = stopOf(host, controls);
  const playback: Playback = Object.freeze({
    finished,
    stop,
    play: () => controls.play(),
    pause: () => controls.pause(),
    get time(): number {
      return controls.time * 1000;
    },
    set time(value: number) {
      if (typeof value === 'number' && Number.isFinite(value)) controls.time = value / 1000;
    },
  });
  scrubs().set(playback, [controls]);
  return playback;
}

function timelineOf(host: MotionHost): MotionLib['timeline'] {
  return (segments, options) => {
    if (!Array.isArray(segments))
      throw invalid('ctx.lib.motion.timeline: список сегментов [элемент, кадры, параметры]');
    const sequence = segments.map((segment: TimelineSegment) => {
      const [el, keyframes, segmentOptions] = segment;
      const at = atOf(segmentOptions?.at);
      const transition = { ...transitionOf(segmentOptions), ...(at === undefined ? {} : { at }) };
      return [ownNodes(host, 'timeline', el), framesOf(keyframes), transition] as const;
    });
    const repeat = options?.repeat;
    const controls = animate(
      sequence.map(([nodes, frames, transition]) => [nodes, frames, transition]),
      {
        delay: ms(options?.delay, 0),
        ...(typeof repeat === 'number' && repeat >= 0 ? { repeat } : {}),
        ...(options?.repeatType === 'reverse' ? { repeatType: 'reverse' as const } : {}),
      },
    );
    return playbackOf(host, controls);
  };
}

function tweenOf(host: MotionHost): MotionLib['tween'] {
  return (from, to, options, onUpdate) => {
    if (!Number.isFinite(from) || !Number.isFinite(to)) throw invalid('ctx.lib.motion.tween: from и to — числа');
    if (typeof onUpdate !== 'function') throw invalid('ctx.lib.motion.tween: четвёртым аргументом — функция');
    const update = (value: number): void => void host.run('runtime', () => onUpdate(value));
    return playbackOf(
      host,
      animate(from, to, { ...easingOf(options), delay: ms(options?.delay, 0), onUpdate: update }),
    );
  };
}

function animateOf(host: MotionHost): MotionLib['animate'] {
  return (el, keyframes, options) =>
    playbackOf(host, animate(ownNodes(host, 'animate', el), framesOf(keyframes), transitionOf(options)));
}

export const motion: LibAdapter<'motion'> = (host) =>
  Object.freeze({ timeline: timelineOf(host), tween: tweenOf(host), animate: animateOf(host) });
