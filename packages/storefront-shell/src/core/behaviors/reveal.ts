import { inView } from 'motion';
import type { PresetSpec } from './catalog';
import { PRESETS, PRESET_PARAMS } from './presets';
import type { Keyframes } from '../types';
import { animateNode } from './animate-node';
import { readParams } from './params';
import { splitChars, splitLines, splitWords } from './split';
import type { Reveal, RevealHost } from './types';

// Появления data-animate (design.md блока 6, раздел 9): пресеты пяти тем «один в один», пачки одного кадра, буквы,
// слова и строки (12.11), маска, размытие и прорисовка линий, чётность секций у appear-side. Скрытое начальное
// состояние ставит SDK инлайном; выключатели — выбор словаря «Появление секций», «уменьшить движение» и превью
// конструктора.

// Отступ наблюдателя у Motion — шаблонный тип из 1–4 значений «число px/%»; строку пресета проверяем предикатом.
type MarginPart = `${number}px` | `${number}%`;
type CssMargin =
  | MarginPart
  | `${MarginPart} ${MarginPart}`
  | `${MarginPart} ${MarginPart} ${MarginPart}`
  | `${MarginPart} ${MarginPart} ${MarginPart} ${MarginPart}`;
const MARGIN_PATTERN = /^-?\d+(\.\d+)?(px|%)( -?\d+(\.\d+)?(px|%)){0,3}$/;
const isCssMargin = (value: string): value is CssMargin => MARGIN_PATTERN.test(value);

const REVEAL_ATTRIBUTE = 'data-motion-reveal';
const SPEC_BY_NAME: ReadonlyMap<string, PresetSpec> = new Map(Object.entries(PRESETS));
const reported = new Set<string>();

// Двигаемый узел: HTML-элемент или линия SVG — у обоих есть style.
type Mover = Element & ElementCSSInlineStyle;

interface Pending {
  readonly element: HTMLElement;
  readonly name: string;
  readonly spec: PresetSpec;
  readonly dataDelay: number;
  readonly movers: readonly Mover[];
  readonly x: number;
}

const isHTMLElement = (node: Element): node is HTMLElement => node instanceof HTMLElement;
const isMover = (node: Element): node is Mover => 'style' in node;

const SHAPES = 'path,line,polyline,polygon,circle,ellipse,rect';

// Линии SVG: сам элемент или все линии внутри. pathLength="1" ставит SDK: штрих 1 и сдвиг 1 → 0 дают прорисовку любой
// длины.
function shapesOf(element: Element): readonly Mover[] {
  const shapes = (element.matches(SHAPES) ? [element] : [...element.querySelectorAll(SHAPES)]).filter(isMover);
  shapes.forEach((shape) => shape.setAttribute('pathLength', '1'));
  return shapes;
}

// Что движется (target пресета): self — сам элемент, children — его дети, section — ближайшая merfy-section, остальное —
// куски текста и линии SVG. Строки (lines) ждут шрифты и приходят позже — attachElement.
function moversOf(element: HTMLElement, spec: PresetSpec): readonly Mover[] {
  if (spec.target === 'self') return [element];
  if (spec.target === 'children') return [...element.children].filter(isHTMLElement);
  if (spec.target === 'letters') return splitChars(element);
  if (spec.target === 'words') return splitWords(element, true);
  if (spec.target === 'shapes') return shapesOf(element);
  const section = element.closest<HTMLElement>('merfy-section');
  return section === null ? [element] : [section];
}

// Сдвиг по горизонтали у appear-side: чётная секция main — слева, нечётная — справа (satin, факт 10).
function xOf(element: HTMLElement, spec: PresetSpec): number {
  if (spec.target !== 'section') return spec.x;
  const sections = [...document.querySelectorAll('main merfy-section')];
  const index = sections.indexOf(element.closest('merfy-section') ?? element);
  return index % 2 === 0 ? -spec.x : spec.x;
}

function pendingOf(name: string, spec: PresetSpec, element: HTMLElement, movers: readonly Mover[]): Pending {
  return {
    element,
    name,
    spec,
    dataDelay: Number(readParams(element, PRESET_PARAMS).delay),
    movers,
    x: xOf(element, spec),
  };
}

// Номер в пачке: у self и section — элемента в пачке, у остальных — куска или ребёнка одного элемента.
const indexOfMover = (pending: Pending, mover: number, batchIndex: number): number =>
  pending.spec.target === 'self' || pending.spec.target === 'section' ? batchIndex : mover;

// Кадры пресета: прозрачность и сдвиг, если они есть, и extra (маска, размытие, штрих).
function framesOf(pending: Pending): Keyframes {
  const { spec, x } = pending;
  return {
    ...(spec.opacity === 1 ? {} : { opacity: [spec.opacity, 1] }),
    ...(x === 0 && spec.y === 0 ? {} : { transform: [`translate(${x}${spec.unit}, ${spec.y}${spec.unit})`, 'none'] }),
    ...Object.fromEntries(Object.entries(spec.extra ?? {}).map(([name, range]) => [name, [...range]])),
  };
}

// Инлайн, который ставит пресет: прозрачность и начало extra. После появления он снимается.
const inlineOf = (spec: PresetSpec): readonly (readonly [string, string | number])[] => [
  ...(spec.opacity === 1 ? [] : [['opacity', spec.opacity] as const]),
  ...Object.entries(spec.extra ?? {}).map(([name, range]) => [name, range[0]] as const),
];

function play(pending: Pending, batchIndex: number, signal: AbortSignal): void {
  const { spec } = pending;
  const frames = framesOf(pending);
  pending.movers.forEach((mover, moverIndex) => {
    const delay = spec.delay + pending.dataDelay + indexOfMover(pending, moverIndex, batchIndex) * spec.stagger;
    const run = animateNode(
      mover,
      frames,
      { duration: spec.duration, easing: spec.easing, delay },
      { instant: false, signal },
    );
    void run.finished.then(() => {
      inlineOf(spec).forEach(([name]) => Reflect.set(mover.style, name, ''));
      run.stop();
    });
  });
}

const hideMovers = (pending: Pending): void => {
  pending.movers.forEach((mover) => {
    inlineOf(pending.spec).forEach(([name, value]) => Reflect.set(mover.style, name, String(value)));
  });
};

// Пачка (Р6-11): элементы одного пресета, вошедшие в экран в одном кадре — общий rAF, задержки по номеру.
function makeBatcher(signal: AbortSignal): (pending: Pending) => void {
  let queued: Pending[] = [];
  let scheduled = false;
  const flush = (): void => {
    scheduled = false;
    const byName = new Map<string, Pending[]>();
    queued.forEach((item) => {
      const list = byName.get(item.name) ?? [];
      list.push(item);
      byName.set(item.name, list);
    });
    byName.forEach((list) => byDocumentOrder(list).forEach((item, index) => play(item, index, signal)));
    queued = [];
  };
  return (pending: Pending): void => {
    queued.push(pending);
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(flush);
  };
}

// Пачка — по порядку документа (Р6-11): наблюдатели у элементов свои, порядок их срабатывания не гарантирован.
const byDocumentOrder = (list: readonly Pending[]): readonly Pending[] =>
  [...list].sort((a, b) => (a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

// Верх элемента выше 85 % высоты окна — виден при подключении.
const visibleAtStart = (element: HTMLElement): boolean =>
  element.getBoundingClientRect().top < window.innerHeight * 0.85;

function reportUnknown(name: string): void {
  if (reported.has(name)) return;
  reported.add(name);
  console.error(`Появление ${name}: такого пресета нет`);
}

// trigger: 'view' — наблюдение до входа в экран; по входу — в пачку, наблюдение снимается.
function watchInView(
  pending: Pending,
  element: HTMLElement,
  batch: (pending: Pending) => void,
  signal: AbortSignal,
): void {
  const spec = pending.spec;
  let stop: (() => void) | null = null;
  stop = inView(
    element,
    () => {
      stop?.();
      batch(pending);
    },
    { margin: isCssMargin(spec.margin) ? spec.margin : '0px', amount: spec.amount },
  );
  signal.addEventListener('abort', () => stop?.(), { once: true });
}

function start(pending: Pending, element: HTMLElement, batch: (pending: Pending) => void, signal: AbortSignal): void {
  const { spec } = pending;
  if (spec.trigger === 'load') {
    hideMovers(pending);
    batch(pending);
    return;
  }
  if (spec.visibleAtStart === 'show' && visibleAtStart(element)) return;
  hideMovers(pending);
  if (visibleAtStart(element)) {
    batch(pending);
    return;
  }
  watchInView(pending, element, batch, signal);
}

// Строки известны только после загрузки шрифтов: до этого весь текст скрыт, потом скрыты строки, а элемент показан.
function attachLines(
  element: HTMLElement,
  name: string,
  spec: PresetSpec,
  batch: (pending: Pending) => void,
  signal: AbortSignal,
): void {
  element.style.opacity = '0';
  splitLines(element, true, signal).then(
    (lines) => {
      if (!signal.aborted) start(pendingOf(name, spec, element, lines), element, batch, signal);
      element.style.opacity = '';
    },
    (error: unknown) => {
      element.style.opacity = '';
      console.error(`Появление ${name}: ${String(error)}`);
    },
  );
}

function attachElement(element: HTMLElement, batch: (pending: Pending) => void, signal: AbortSignal): void {
  const name = element.getAttribute('data-animate') ?? '';
  const spec = SPEC_BY_NAME.get(name);
  if (spec === undefined) {
    reportUnknown(name);
    return;
  }
  if (spec.target === 'lines') attachLines(element, name, spec, batch, signal);
  else start(pendingOf(name, spec, element, moversOf(element, spec)), element, batch, signal);
}

export const reveal: Reveal = {
  attach(host: RevealHost): void {
    if (document.documentElement.getAttribute(REVEAL_ATTRIBUTE) !== 'on') return;
    if (host.motion.reduced || host.motion.preview) return;
    const batch = makeBatcher(host.signal);
    host.elements.forEach((element) => attachElement(element, batch, host.signal));
  },
};
