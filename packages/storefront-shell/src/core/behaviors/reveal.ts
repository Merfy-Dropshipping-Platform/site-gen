import { inView } from 'motion';
import { PRESETS, PRESET_PARAMS, type PresetSpec } from './catalog';
import { animateNode } from './motion';
import { readParams } from './params';
import type { Reveal, RevealHost } from './types';

// Появления data-animate (design.md блока 6, раздел 9): пресеты пяти тем «один в один», пачки одного кадра, буквы,
// чётность секций у appear-side. Скрытое начальное состояние ставит SDK инлайном; выключатели — выбор словаря
// «Появление секций», «уменьшить движение» и превью конструктора.

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

interface Pending {
  readonly element: HTMLElement;
  readonly name: string;
  readonly spec: PresetSpec;
  readonly dataDelay: number;
  readonly movers: readonly HTMLElement[];
  readonly x: number;
}

const isHTMLElement = (node: Element): node is HTMLElement => node instanceof HTMLElement;

// Буквы: текст — в aria-label элемента, внутри — по span на букву, пробелы — простым текстом.
function lettersOf(element: HTMLElement): readonly HTMLElement[] {
  const text = element.textContent ?? '';
  element.setAttribute('aria-label', text);
  element.replaceChildren();
  const spans: HTMLElement[] = [];
  for (const char of text) {
    if (char === ' ') {
      element.append(' ');
      continue;
    }
    const span = document.createElement('span');
    span.setAttribute('aria-hidden', 'true');
    span.style.display = 'inline-block';
    span.textContent = char;
    element.append(span);
    spans.push(span);
  }
  return spans;
}

// Что движется (target пресета): self — сам элемент, children — его дети, section — ближайшая merfy-section.
function moversOf(element: HTMLElement, spec: PresetSpec): readonly HTMLElement[] {
  if (spec.target === 'self') return [element];
  if (spec.target === 'children') return [...element.children].filter(isHTMLElement);
  if (spec.target === 'letters') return lettersOf(element);
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

function pendingOf(name: string, spec: PresetSpec, element: HTMLElement): Pending {
  return {
    element,
    name,
    spec,
    dataDelay: Number(readParams(element, PRESET_PARAMS).delay),
    movers: moversOf(element, spec),
    x: xOf(element, spec),
  };
}

// Номер в пачке: у self и section — элемента в пачке, у children и letters — ребёнка и буквы одного элемента.
const indexOfMover = (pending: Pending, mover: number, batchIndex: number): number =>
  pending.spec.target === 'children' || pending.spec.target === 'letters' ? mover : batchIndex;

function play(pending: Pending, batchIndex: number, signal: AbortSignal): void {
  const { spec } = pending;
  pending.movers.forEach((mover, moverIndex) => {
    const delay = spec.delay + pending.dataDelay + indexOfMover(pending, moverIndex, batchIndex) * spec.stagger;
    const run = animateNode(
      mover,
      {
        opacity: [spec.opacity, 1],
        transform: [`translate(${pending.x}${spec.unit}, ${spec.y}${spec.unit})`, 'none'],
      },
      { duration: spec.duration, easing: spec.easing, delay },
      { instant: false, signal },
    );
    void run.finished.then(() => {
      mover.style.opacity = '';
      run.stop();
    });
  });
}

const hideMovers = (pending: Pending): void => {
  pending.movers.forEach((mover) => {
    mover.style.opacity = String(pending.spec.opacity);
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

function attachElement(element: HTMLElement, batch: (pending: Pending) => void, signal: AbortSignal): void {
  const name = element.getAttribute('data-animate') ?? '';
  const spec = SPEC_BY_NAME.get(name);
  if (spec === undefined) {
    reportUnknown(name);
    return;
  }
  const pending = pendingOf(name, spec, element);
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

export const reveal: Reveal = {
  attach(host: RevealHost): void {
    if (document.documentElement.getAttribute(REVEAL_ATTRIBUTE) !== 'on') return;
    if (host.motion.reduced || host.motion.preview) return;
    const batch = makeBatcher(host.signal);
    host.elements.forEach((element) => attachElement(element, batch, host.signal));
  },
};
