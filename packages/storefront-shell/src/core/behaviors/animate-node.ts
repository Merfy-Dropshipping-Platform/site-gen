import { animate as animateMini } from 'motion/mini';
import type { AnimateOptions, Animation, Bezier, EasingName, Keyframes, KeyframeValue } from '../types';
import { EASINGS } from './catalog';

// Анимация одного узла на motion/mini — общая для ctx.animate, появлений и поведений (design.md блока 6, раздел 10).
// Длительность и задержка на входе — миллисекунды, Motion считает секунды; кривая — по имени из каталога, массивом Безье
// или функцией (пружина ctx.animate: Motion превращает её в CSS linear()); снятие секции останавливает анимацию.
// Список, stagger, пружину и повтор разбирает провайдер ctx.animate (motion.ts): этот файл общий для всех поведений и
// стоит в их бюджетах веса.

export interface NodeAnimateOptions extends Omit<AnimateOptions, 'easing' | 'stagger'> {
  readonly easing?: EasingName | Bezier | ((progress: number) => number);
  readonly pseudoElement?: '::backdrop';
}

export interface AnimateRun {
  readonly instant: boolean;
  readonly signal: AbortSignal;
}

type MiniKeyframes = Parameters<typeof animateMini>[1];
// pseudoElement Motion читает из общих параметров (animate-elements: valueOptions), в типе mini-ветки его нет. repeat и
// repeatType mini передаёт в WAAPI как iterations (repeat + 1) и direction ('reverse' → alternate).
type MiniOptions = NonNullable<Parameters<typeof animateMini>[2]> & { readonly pseudoElement?: string };

const DEFAULT_DURATION_MS = 300;
const DEFAULT_DELAY_MS = 0;
const DEFAULT_EASING: EasingName = 'ease-out';

const stopped = (): Animation => ({ finished: Promise.resolve(), stop: () => undefined });

const easingOf = (easing: NonNullable<NodeAnimateOptions['easing']>) =>
  typeof easing === 'string' ? EASINGS[easing] : easing;

// Кадры — копия с новыми массивами: Motion меняет переданные массивы на месте.
function framesOf(keyframes: Keyframes): MiniKeyframes {
  const copy: Record<string, KeyframeValue | KeyframeValue[]> = {};
  for (const [name, value] of Object.entries(keyframes)) {
    copy[name] = typeof value === 'object' ? [...value] : value;
  }
  return copy;
}

// Сразу последний кадр — без повтора и без задержки.
function optionsOf(options: NodeAnimateOptions | undefined, run: AnimateRun): MiniOptions {
  const duration = run.instant ? 0 : (options?.duration ?? DEFAULT_DURATION_MS);
  const delay = run.instant ? 0 : (options?.delay ?? DEFAULT_DELAY_MS);
  return {
    duration: duration / 1000,
    delay: delay / 1000,
    ease: easingOf(options?.easing ?? DEFAULT_EASING),
    pseudoElement: options?.pseudoElement,
    repeat: run.instant ? undefined : options?.repeat,
    repeatType: options?.repeatType,
  };
}

export function animateNode(
  node: Element,
  keyframes: Keyframes,
  options: NodeAnimateOptions | undefined,
  run: AnimateRun,
): Animation {
  if (run.signal.aborted) return stopped();
  const controls = animateMini(node, framesOf(keyframes), optionsOf(options, run));
  // finished выполняется и по концу, и по stop(): Motion при отмене своего обещания не даёт.
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
  run.signal.addEventListener('abort', stop, { once: true });
  return { finished, stop };
}
