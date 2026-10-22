import { animate as animateMini } from 'motion/mini';
import type { AnimateOptions, Animation, Bezier, EasingName, Keyframes, KeyframeValue } from '../types';
import { EASINGS } from './catalog';
import { motionPrefs } from './prefs';
import type { AnimateProvider } from './types';

// ctx.animate и анимации поведений поверх motion/mini (design.md блока 6, раздел 10): SDK импортирует Motion, код секции
// — нет. Длительность и задержка на входе — миллисекунды, Motion считает секунды; кривая — по имени из каталога или
// массивом Безье; превью и «уменьшить движение» — сразу последний кадр; снятие секции останавливает анимацию.

export interface NodeAnimateOptions extends AnimateOptions {
  readonly pseudoElement?: '::backdrop';
}

export interface AnimateRun {
  readonly instant: boolean;
  readonly signal: AbortSignal;
}

type MiniKeyframes = Parameters<typeof animateMini>[1];
// pseudoElement Motion читает из общих параметров (animate-elements: valueOptions), в типе mini-ветки его нет.
type MiniOptions = NonNullable<Parameters<typeof animateMini>[2]> & { readonly pseudoElement?: string };

const DEFAULT_DURATION_MS = 300;
const DEFAULT_DELAY_MS = 0;
const DEFAULT_EASING: EasingName = 'ease-out';

const stopped = (): Animation => ({ finished: Promise.resolve(), stop: () => undefined });

const easingOf = (easing: EasingName | Bezier): Bezier => (typeof easing === 'string' ? EASINGS[easing] : easing);

// Кадры — копия с новыми массивами: Motion меняет переданные массивы на месте.
function framesOf(keyframes: Keyframes): MiniKeyframes {
  const copy: Record<string, KeyframeValue | KeyframeValue[]> = {};
  for (const [name, value] of Object.entries(keyframes)) {
    copy[name] = typeof value === 'object' ? [...value] : value;
  }
  return copy;
}

function optionsOf(options: NodeAnimateOptions | undefined, run: AnimateRun): MiniOptions {
  const duration = run.instant ? 0 : (options?.duration ?? DEFAULT_DURATION_MS);
  const delay = run.instant ? 0 : (options?.delay ?? DEFAULT_DELAY_MS);
  return {
    duration: duration / 1000,
    delay: delay / 1000,
    ease: easingOf(options?.easing ?? DEFAULT_EASING),
    pseudoElement: options?.pseudoElement,
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

// Провайдер ctx.animate: превью и «уменьшить движение» — сразу последний кадр.
export const animate: AnimateProvider = (node, keyframes, options, signal, mode) => {
  const prefs = motionPrefs(window, mode);
  return animateNode(node, keyframes, options, { instant: prefs.reduced || prefs.preview, signal });
};
