import { sectionRefOf } from './section-ref';
import type { Behavior, BehaviorHost, BehaviorInstance } from './types';

// Стираемый слой (поведение scratch): поверх элемента лежит слой, посетитель стирает его курсором с зажатой кнопкой или
// пальцем (pointer events). Слой — canvas, который создаёт ядро: скрипту секции canvas недоступен, поэтому поведение
// целиком здесь. Цвет слоя — data-color (любой цвет CSS, в том числе токен темы var(--muted-foreground)). Элемент с
// data-behavior="scratch" должен быть с позицией (relative): слой растягивается на него целиком. Страница под пальцем
// не прокручивается (touch-action: none) — свайп по слою стирает, а не листает; вне слоя прокрутка как обычно.
// Слой убирается, когда стёрта SCRATCH_DONE_RATIO его площади или нажата «Показать» (data-part="reveal") — кнопка для
// клавиатуры и экранных читалок, ставится над слоем (z-index выше 1). Событие merfy:scratch:done — один раз.
// «Уменьшить движение»: слой исчезает сразу, без затухания.

// Половина слоя: меньше — слой убирается, когда виден ещё почти весь; больше — приходится вытирать углы ради последних
// пикселей, а посетитель уже увидел то, что под слоем.
export const SCRATCH_DONE_RATIO = 0.5;
// Ширина стирающей линии: чуть шире подушечки пальца, чтобы слой стирался за несколько движений.
export const BRUSH_PX = 32;
// Долю стёртого считаем не на каждое движение (чтение пикселей слоя дорого): не чаще раза в 100 мс и при отпускании.
const CHECK_EVERY_MS = 100;
// Долю считаем по каждому четвёртому пикселю по обеим осям: в 16 раз быстрее, на доле в пределах процента не сказывается.
const SAMPLE_STEP = 4;
const FADE_MS = 250;
const MAX_DPR = 2;

const NO_REVEAL_TEXT =
  'Поведение scratch: нет части data-part="reveal" — без кнопки «Показать» слой недоступен с клавиатуры и экранным читалкам';

interface Point {
  readonly x: number;
  readonly y: number;
}

// Состояние одного слоя: рисунок, чьё сейчас касание и где оно было, закончено ли.
interface Layer {
  readonly host: BehaviorHost;
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly color: string;
  readonly reveal: HTMLElement | null;
  touched: boolean; // с первого касания слой больше не перерисовывается при смене размера
  finished: boolean;
  pointer: number | null;
  last: Point | null;
  checkedAt: number;
}

// Цвет слоя, как его видит браузер: значения с var() и именами цветов canvas не понимает, а вычисленный цвет — rgb().
function colorOf(root: HTMLElement, value: string): string {
  const probe = document.createElement('span');
  probe.style.color = value;
  root.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

// Доля прозрачных пикселей слоя — стёртое. Пиксели обходятся одним счётчиком по сетке с шагом SAMPLE_STEP.
function clearedShare({ canvas, context }: Layer): number {
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const columns = Math.ceil(canvas.width / SAMPLE_STEP);
  const total = columns * Math.ceil(canvas.height / SAMPLE_STEP);
  let clear = 0;
  for (let index = 0; index < total; index += 1) {
    const x = (index % columns) * SAMPLE_STEP;
    const y = Math.floor(index / columns) * SAMPLE_STEP;
    if (data[(y * canvas.width + x) * 4 + 3] === 0) clear += 1;
  }
  return total === 0 ? 0 : clear / total;
}

// Размер слоя — размер, который ему дала вёрстка, в пикселях устройства; заливка заново.
function fit(layer: Layer): void {
  const { canvas, context } = layer;
  const box = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  canvas.width = Math.round(box.width * ratio);
  canvas.height = Math.round(box.height * ratio);
  context.globalCompositeOperation = 'source-over';
  context.fillStyle = layer.color;
  context.fillRect(0, 0, canvas.width, canvas.height);
}

// Слой исчезает за FADE_MS; «уменьшить движение» и браузер без Web Animations — сразу.
function removeLayer(layer: Layer): void {
  const { canvas } = layer;
  if (layer.host.motion.reduced || typeof canvas.animate !== 'function') {
    canvas.remove();
    return;
  }
  const fade = canvas.animate({ opacity: [1, 0] }, { duration: FADE_MS, easing: 'ease-out' });
  void fade.finished.then(
    () => canvas.remove(),
    () => canvas.remove(),
  );
}

function finish(layer: Layer): void {
  if (layer.finished) return;
  layer.finished = true;
  layer.reveal?.setAttribute('hidden', '');
  layer.host.core?.emit('merfy:scratch:done', sectionRefOf(layer.host));
  layer.canvas.style.pointerEvents = 'none';
  removeLayer(layer);
}

function check(layer: Layer): void {
  layer.checkedAt = performance.now();
  if (clearedShare(layer) >= SCRATCH_DONE_RATIO) finish(layer);
}

// Точка касания в пикселях рисунка: слой мог растянуться вёрсткой после первого касания.
function pointOf({ canvas }: Layer, event: PointerEvent): Point {
  const box = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - box.left) * canvas.width) / box.width,
    y: ((event.clientY - box.top) * canvas.height) / box.height,
  };
}

// Линия от прошлой точки к этой; касание без движения — точка (круглый конец линии).
function erase(layer: Layer, to: Point): void {
  const { canvas, context } = layer;
  const from = layer.last ?? to;
  context.globalCompositeOperation = 'destination-out';
  context.lineWidth = BRUSH_PX * (canvas.width / canvas.getBoundingClientRect().width);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  layer.last = to;
}

function onDown(layer: Layer, event: PointerEvent): void {
  const mouseButton = event.pointerType === 'mouse' && event.button !== 0;
  if (layer.finished || layer.pointer !== null || mouseButton) return;
  event.preventDefault();
  layer.canvas.setPointerCapture(event.pointerId);
  layer.pointer = event.pointerId;
  layer.touched = true;
  layer.last = null;
  erase(layer, pointOf(layer, event));
}

function onMove(layer: Layer, event: PointerEvent): void {
  if (event.pointerId !== layer.pointer || layer.finished) return;
  erase(layer, pointOf(layer, event));
  if (performance.now() - layer.checkedAt >= CHECK_EVERY_MS) check(layer);
}

function onRelease(layer: Layer, event: PointerEvent): void {
  if (event.pointerId !== layer.pointer) return;
  layer.pointer = null;
  layer.last = null;
  if (!layer.finished) check(layer);
}

function listen(layer: Layer): void {
  const { canvas, host } = layer;
  const options = { signal: host.signal };
  canvas.addEventListener('pointerdown', (event) => onDown(layer, event), options);
  canvas.addEventListener('pointermove', (event) => onMove(layer, event), options);
  canvas.addEventListener('pointerup', (event) => onRelease(layer, event), options);
  canvas.addEventListener('pointercancel', (event) => onRelease(layer, event), options);
  layer.reveal?.addEventListener('click', () => finish(layer), options);
}

// До первого касания слой перерисовывается при смене размера (картинка догрузилась, окно повернули), после — остаётся
// как есть и тянется вёрсткой, чтобы не потерять стёртое.
function watchSize(layer: Layer): void {
  if (typeof ResizeObserver !== 'function') return;
  const observer = new ResizeObserver(() => {
    if (!layer.touched && !layer.finished) fit(layer);
  });
  observer.observe(layer.canvas);
  layer.host.signal.addEventListener('abort', () => observer.disconnect(), { once: true });
}

function createCanvas(root: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;z-index:1;touch-action:none;border-radius:inherit;cursor:crosshair';
  if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
  root.append(canvas);
  return canvas;
}

export const scratch: Behavior<'scratch'> = {
  name: 'scratch',
  attach(host: BehaviorHost): BehaviorInstance {
    const reveal = host.root.querySelector<HTMLElement>('[data-part="reveal"]');
    if (reveal === null) console.error(NO_REVEAL_TEXT);
    const canvas = createCanvas(host.root);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      canvas.remove(); // нет canvas — слоя нет, содержимое открыто
      return {};
    }
    const color = colorOf(host.root, String(host.params.color));
    const layer: Layer = {
      host,
      canvas,
      context,
      color,
      reveal,
      touched: false,
      finished: false,
      pointer: null,
      last: null,
      checkedAt: 0,
    };
    fit(layer);
    listen(layer);
    watchSize(layer);
    return {};
  },
};
