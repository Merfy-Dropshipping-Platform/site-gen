import { checkKeyframes } from '../keyframes';
import type { AnimateOptions, PointerPoint } from '../types';
import { animateNode, type NodeAnimateOptions } from './animate-node';
import { motionPrefs } from './prefs';
import { splitChars, splitLines, splitWords } from './split';
import type { AnimateProvider, PointerProvider, SplitProvider } from './types';

// Провайдеры ctx.animate, ctx.split и ctx.on(…, 'pointermove') (design.md блока 6, раздел 10): SDK импортирует Motion,
// код секции — нет. Анимация узла — animate-node.ts; здесь то, что нужно только скрипту секции: проверка кадров
// (checkKeyframes), пружина, список элементов, повтор, куски текста и курсор. «Уменьшить движение» и запуск секции в
// превью после правки настроек или текста (prefs.ts) — сразу последний кадр (повтора нет); курсор приходит как обычно.

// Пружина — затухающие колебания единичной ступени за время 1: 1 − e^(−st)(cos ωt + (s/ω) sin ωt), s = 8 (к концу
// отклонение меньше 0,3 %), затухание ζ = 1 − bounce (bounce от 0 до 0.95; ζ не больше 0,999). Motion превращает такую
// функцию в CSS linear(); в конце — ровно 1.
const DECAY = 8;
export const springOf =
  (bounce: number) =>
  (progress: number): number => {
    const zeta = Math.min(0.999, 1 - bounce);
    const frequency = (DECAY / zeta) * Math.sqrt(1 - zeta * zeta);
    const phase = frequency * progress;
    return progress >= 1
      ? 1
      : 1 - Math.exp(-DECAY * progress) * (Math.cos(phase) + (DECAY / frequency) * Math.sin(phase));
  };

// Число из кода секции: не число и отрицательное (NaN тоже) — умолчание.
const num = (value: unknown, fallback: number): number => (typeof value === 'number' && value >= 0 ? value : fallback);

// Параметры одного элемента списка: stagger сдвигает старт на index × stagger, пружина становится функцией кривой
// (bounce не больше 0.95, по умолчанию 0.25; duration — мс, по умолчанию duration анимации или 600).
function optionsOf(options: AnimateOptions | undefined, index: number): NodeAnimateOptions {
  const easing = options?.easing;
  const common = {
    delay: num(options?.delay, 0) + index * num(options?.stagger, 0),
    repeat: num(options?.repeat, 0),
    repeatType: options?.repeatType,
  };
  if (typeof easing !== 'object' || !('spring' in easing))
    return { ...common, duration: num(options?.duration, 300), easing };
  const { bounce, duration } = easing.spring;
  return {
    ...common,
    duration: num(duration, num(options?.duration, 600)),
    easing: springOf(Math.min(num(bounce, 0.25), 0.95)),
  };
}

// Провайдер ctx.animate. Список — одна анимация на всех: finished — когда закончили все, stop останавливает все.
export const animate: AnimateProvider = (nodes, keyframes, options, signal, mode) => {
  checkKeyframes(keyframes);
  const prefs = motionPrefs(window, mode, nodes[0]?.closest('merfy-section'));
  const run = { instant: prefs.reduced || prefs.still, signal };
  const runs = nodes.map((node, index) => animateNode(node, keyframes, optionsOf(options, index), run));
  return {
    finished: Promise.all(runs.map((item) => item.finished)).then(() => undefined),
    stop: () => runs.forEach((item) => item.stop()),
  };
};

// Провайдер ctx.on(…, 'pointermove'): не чаще раза в кадр, берётся последнее событие; координаты курсора читаются в
// момент кадра — относительно секции и (at) любого её элемента.
export const pointer: PointerProvider = (target, scope, deliver, signal) => {
  let last: MouseEvent | null = null;
  const pointOf = (event: MouseEvent, box: Element): PointerPoint => {
    const rect = box.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return { x, y, px: rect.width > 0 ? x / rect.width : 0, py: rect.height > 0 ? y / rect.height : 0 };
  };
  const frame = (): void => {
    const event = last;
    last = null;
    if (event === null || signal.aborted) return;
    deliver(event, {
      pointer: pointOf(event, scope.root),
      at: (el) => {
        const node = scope.nodeOf(el);
        return node === null ? null : pointOf(event, node);
      },
    });
  };
  // Событие без координат (не мышь, не касание) пропускаем; кадр уже запрошен, пока last не пуст.
  const listener = (event: Event): void => {
    if (!(event instanceof MouseEvent)) return;
    if (last === null) requestAnimationFrame(frame);
    last = event;
  };
  target.addEventListener('pointermove', listener, { signal });
  return () => target.removeEventListener('pointermove', listener);
};

// Провайдер ctx.split: chars и words — сразу, lines — после загрузки шрифтов (Promise).
export const split: SplitProvider = (node, by, signal) => {
  if (node instanceof HTMLElement) {
    if (by === 'chars') return splitChars(node);
    if (by === 'words') return splitWords(node, false);
    if (by === 'lines') return splitLines(node, false, signal);
  }
  throw new Error('ctx.split: элемент HTML и chars, words или lines');
};
