import { afterEach, describe, expect, it, vi } from 'vitest';
import { behaviors } from '../src/core/behaviors/part';
import { pointer, split, springOf } from '../src/core/behaviors/motion';
import { PRESETS } from '../src/core/behaviors/presets';
import { ANIMATABLE } from '../src/core/keyframes';
import { start, type StartedCore } from '../src/core/start';
import type { El, PointerSectionEvent } from '../src/core/types';
import { configTag, entry, placeSection, tick, watchFailures } from './core-support';

// ctx.split, кривая пружины, ctx.on(…, 'pointermove') и пресеты 12.11 (этап 2а–2г спеки анимаций) в jsdom; анимации и
// раскладку строк по-настоящему проверяют тесты Chromium (motion.browser.test.ts, reveal.browser.test.ts).
const signal = new AbortController().signal;
const holder = (html: string): HTMLElement => {
  const element = document.createElement('p');
  element.innerHTML = html;
  document.body.append(element);
  return element;
};

// chars и words провайдер отдаёт сразу, не Promise.
const now = (element: Element, by: 'chars' | 'words'): readonly HTMLElement[] => {
  const pieces = split(element, by, signal);
  if (pieces instanceof Promise) throw new Error('ждали список, пришёл Promise');
  return pieces;
};

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('split', () => {
  it('chars: по span на букву, пробелы — простым текстом, текст — в aria-label', () => {
    const element = holder('Шарф  <b>и</b>\n шапка');
    const pieces = now(element, 'chars');
    expect(element.getAttribute('aria-label')).toBe('Шарф и шапка');
    expect(pieces.map((piece) => piece.textContent).join('')).toBe('Шарфишапка');
    expect(pieces.every((piece) => piece.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(pieces.every((piece) => piece.style.display === 'inline-block')).toBe(true);
    expect(element.textContent).toBe('Шарф и шапка');
    expect(element.querySelector('b')).toBeNull();
  });

  it('words: по span на слово, между словами пробел; пустой текст — пустой список', () => {
    const element = holder('  Три   слова\nздесь ');
    const pieces = now(element, 'words');
    expect(pieces.map((piece) => piece.textContent)).toEqual(['Три', 'слова', 'здесь']);
    expect(element.textContent).toBe('Три слова здесь');
    expect(element.getAttribute('aria-label')).toBe('Три слова здесь');
    expect(now(holder('   '), 'words')).toEqual([]);
  });

  it('lines: Promise; без раскладки (jsdom) вся строка одна; блок с aria-hidden', async () => {
    const element = holder('Раз два три');
    const lines = await split(element, 'lines', signal);
    expect(lines.map((line) => line.textContent)).toEqual(['Раз два три']);
    expect(lines[0]?.style.display).toBe('block');
    expect(lines[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(element.getAttribute('aria-label')).toBe('Раз два три');
  });

  it('lines: снятая секция строк не получает и текст не трогает', async () => {
    const stopped = new AbortController();
    const element = holder('Раз два');
    const pending = split(element, 'lines', stopped.signal);
    stopped.abort();
    expect(await pending).toEqual([]);
    expect(element.children).toHaveLength(0);
    expect(element.textContent).toBe('Раз два');
  });

  it('lines: слова с разной высотой верха — разные строки (раскладка из offsetTop)', async () => {
    const element = holder('а б в г');
    const tops: Record<string, number> = { а: 0, б: 0, в: 30, г: 30 };
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return tops[this.textContent ?? ''] ?? 0;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(30);
    const lines = await split(element, 'lines', signal);
    vi.restoreAllMocks();
    expect(lines.map((line) => line.textContent)).toEqual(['а б', 'в г']);
  });

  it('не HTML-элемент и неизвестный способ — ошибка с текстом для автора', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    expect(() => split(svg, 'words', signal)).toThrow('ctx.split');
    // @ts-expect-error способ вне 'chars' | 'words' | 'lines'
    expect(() => split(holder('а'), 'sentences', signal)).toThrow('ctx.split');
  });
});

describe('springOf', () => {
  const samples = (bounce: number): number[] => {
    const curve = springOf(bounce);
    return Array.from({ length: 101 }, (_item, index) => curve(index / 100));
  };

  it('начинается в 0 и кончается ровно в 1', () => {
    for (const bounce of [0, 0.25, 0.9]) {
      const values = samples(bounce);
      expect(values[0]).toBeCloseTo(0, 5);
      expect(values[100]).toBe(1);
    }
  });

  it('bounce 0 — без отскока; больше bounce — выше пик', () => {
    expect(Math.max(...samples(0))).toBeLessThanOrEqual(1.0001);
    const low = Math.max(...samples(0.2));
    const high = Math.max(...samples(0.6));
    expect(low).toBeGreaterThan(1);
    expect(high).toBeGreaterThan(low);
    for (const value of samples(0.95)) expect(Number.isFinite(value)).toBe(true);
  });
});

describe('ctx.on pointermove', () => {
  let started: StartedCore | null = null;

  afterEach(() => {
    started?.stop();
    started = null;
  });

  const frameQueue = (): { run(): void; size(): number } => {
    const queue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => queue.push(callback));
    return {
      run: () => queue.splice(0).forEach((callback) => callback(0)),
      size: () => queue.length,
    };
  };
  const moveAt = (x: number, y: number, target: EventTarget = document): void => {
    target.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
  };
  const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  });

  it('раз в кадр с последним положением; координаты секции и элемента в px и долях; inside работает', async () => {
    document.head.innerHTML = configTag('live');
    const frames = frameQueue();
    const section = placeSection('shop:a', 'a', '<button data-ref="b"></button>');
    const button = section.querySelector('button');
    if (button === null) throw new Error('нет кнопки');
    vi.spyOn(section, 'getBoundingClientRect').mockReturnValue(rect(100, 100, 400, 200));
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(rect(200, 150, 100, 50));
    const seen: PointerSectionEvent[] = [];
    const refs: { magnet: El | null } = { magnet: null };
    started = start({
      parts: [behaviors({ list: [], pointer })],
      sections: [
        entry('shop:a', {
          mount: (el, ctx) => {
            refs.magnet = el.ref('b');
            ctx.on('document', 'pointermove', (event) => void seen.push(event));
          },
        }),
      ],
    });
    await tick();
    moveAt(10, 10);
    moveAt(20, 20);
    moveAt(250, 175, button);
    expect(frames.size()).toBe(1);
    expect(seen).toHaveLength(0);
    frames.run();
    expect(seen).toHaveLength(1);
    const event = seen[0];
    const { magnet } = refs;
    if (magnet === null || event === undefined) throw new Error('нет элемента или события');
    expect(event.type).toBe('pointermove');
    expect(event.pointer).toEqual({ x: 150, y: 75, px: 0.375, py: 0.375 });
    expect(event.at(magnet)).toEqual({ x: 50, y: 25, px: 0.5, py: 0.5 });
    expect(event.inside(magnet)).toBe(true);
    moveAt(0, 0);
    expect(frames.size()).toBe(1);
  });

  it('после снятия секции событий нет, кадр в очереди ничего не зовёт; чужой элемент — null; без размера — 0', async () => {
    document.head.innerHTML = configTag('live');
    const frames = frameQueue();
    const section = placeSection('shop:a', 'a', '<i data-ref="i"></i>');
    placeSection('shop:b', 'b', '<i data-ref="o"></i>');
    vi.spyOn(section, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 0, 0));
    const seen: { section: unknown; other: unknown }[] = [];
    let foreign: El | null = null;
    started = start({
      parts: [behaviors({ list: [], pointer })],
      sections: [
        entry('shop:a', {
          mount: (el, ctx) => {
            ctx.on('document', 'pointermove', (event) => {
              seen.push({ section: event.pointer, other: foreign && event.at(foreign) });
            });
          },
        }),
        entry('shop:b', { mount: (el) => void (foreign = el.ref('o')) }),
      ],
    });
    await tick();
    moveAt(5, 7);
    frames.run();
    expect(seen).toEqual([{ section: { x: 5, y: 7, px: 0, py: 0 }, other: null }]);
    moveAt(1, 1);
    section.remove();
    await tick();
    frames.run();
    moveAt(2, 2);
    expect(frames.size()).toBe(0);
    expect(seen).toHaveLength(1);
  });

  it('без провайдера pointer — сбой part-unknown с текстом для автора', async () => {
    document.head.innerHTML = configTag('live');
    const failures = watchFailures();
    placeSection('shop:a', 'a');
    started = start({
      parts: [behaviors({ list: [] })],
      sections: [entry('shop:a', { mount: (_el, ctx) => void ctx.on('document', 'pointermove', () => undefined) })],
    });
    await tick();
    expect(failures.details[0]?.message).toContain('ctx.on: на странице нет кода анимаций');
    failures.stop();
  });

  it('остальные события ctx.on как раньше: keydown приходит сразу, без кадра', async () => {
    document.head.innerHTML = configTag('live');
    const frames = frameQueue();
    placeSection('shop:a', 'a');
    const keys: (string | null)[] = [];
    started = start({
      parts: [behaviors({ list: [], pointer })],
      sections: [entry('shop:a', { mount: (_el, ctx) => void ctx.on('document', 'keydown', (event) => keys.push(event.key)) })],
    });
    await tick();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(keys).toEqual(['Escape']);
    expect(frames.size()).toBe(0);
  });
});

describe('пресеты 12.11', () => {
  it('words, lines, mask-up, blur-in, draw есть в каталоге; extra — только свойства ctx.animate', () => {
    for (const name of ['words', 'lines', 'mask-up', 'blur-in', 'draw'] as const) {
      expect(PRESETS[name], name).toBeDefined();
      for (const property of Object.keys(PRESETS[name].extra ?? {})) expect(ANIMATABLE.has(property), property).toBe(true);
    }
  });

  it('значения: слова и строки — из-под маски в процентах, маска — clipPath, размытие — filter, линия — штрих', () => {
    expect(PRESETS.words).toMatchObject({ target: 'words', y: 105, unit: '%', easing: 'expo.out', stagger: 60 });
    expect(PRESETS.lines).toMatchObject({ target: 'lines', y: 110, unit: '%', easing: 'expo.out', stagger: 110 });
    expect(PRESETS['mask-up']).toMatchObject({ target: 'self', opacity: 1, y: 40, duration: 1200 });
    expect(PRESETS['mask-up'].extra?.clipPath).toEqual(['inset(100% 0% 0% 0%)', 'inset(0% 0% 0% 0%)']);
    expect(PRESETS['blur-in'].extra?.filter).toEqual(['blur(16px)', 'blur(0px)']);
    expect(PRESETS.draw).toMatchObject({ target: 'shapes', opacity: 1, y: 0 });
    expect(PRESETS.draw.extra).toEqual({ strokeDasharray: [1, 1], strokeDashoffset: [1, 0] });
  });
});
