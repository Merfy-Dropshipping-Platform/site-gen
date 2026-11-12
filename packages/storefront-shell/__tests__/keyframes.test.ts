import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { behaviors } from '../src/core/behaviors/part';
import { animate as animateProvider } from '../src/core/behaviors/motion';
import type { AnimateProvider, SplitProvider } from '../src/core/behaviors/types';
import { checkKeyframes } from '../src/core/keyframes';
import { start, type StartedCore } from '../src/core/start';
import type { El } from '../src/core/types';
import { configTag, entry, errorOf, placeSection, tick, watchFailures } from './core-support';

// Граница ctx.animate (design.md блока 6, раздел 10): только свойства из списка, значения без url(), кавычек и «\»,
// только элементы своей секции; Motion подаёт часть behaviors, без неё — сбой секции с понятным текстом.
const done: AnimateProvider = () => ({ finished: Promise.resolve(), stop: () => undefined });

describe('checkKeyframes', () => {
  it('свойства из списка: числа, строки, массивы кадров', () => {
    expect(() =>
      checkKeyframes({
        opacity: [0, 1],
        transform: ['translateY(24px)', 'none'],
        backgroundColor: '#f2e8dc',
        maxHeight: '0px',
      }),
    ).not.toThrow();
  });

  it('с 12.11 в списке ещё clipPath, filter, strokeDashoffset, strokeDasharray, letterSpacing, borderRadius, backgroundPosition', () => {
    expect(() =>
      checkKeyframes({
        clipPath: ['inset(100% 0% 0% 0%)', 'inset(0% 0% 0% 0%)'],
        filter: ['blur(12px)', 'blur(0px)'],
        strokeDashoffset: [1, 0],
        strokeDasharray: 1,
        letterSpacing: '0.2em',
        borderRadius: ['0px', '50%'],
        backgroundPosition: '100% 0%',
      }),
    ).not.toThrow();
  });

  it.each([
    'none',
    'blur(4px)',
    'blur(4px) brightness(1.2) contrast(90%) saturate(2) grayscale(0.5) opacity(0.3)',
    ' BLUR( 2px ) ',
  ])('filter %s — можно', (value) => {
    expect(() => checkKeyframes({ filter: value })).not.toThrow();
    expect(() => checkKeyframes({ filter: ['none', value] })).not.toThrow();
  });

  it.each([
    'drop-shadow(0 0 4px red)',
    'hue-rotate(90deg)',
    'blur(4px) drop-shadow(1px 1px 1px #000)',
    'blur(var(--x))',
    'blur(1px); color: red',
    'blur(',
    '',
  ])('filter %s — sdk-call-invalid', (value) => {
    expect(errorOf(() => checkKeyframes({ filter: value }))).toMatchObject({ code: 'sdk-call-invalid' });
    expect(errorOf(() => checkKeyframes({ filter: ['none', value] }))).toMatchObject({ code: 'sdk-call-invalid' });
  });

  it('filter числом — sdk-call-invalid; url() в clipPath и кавычки в filter — тоже', () => {
    expect(errorOf(() => checkKeyframes({ filter: 4 }))).toMatchObject({ code: 'sdk-call-invalid' });
    expect(errorOf(() => checkKeyframes({ clipPath: 'url(#mask)' }))).toMatchObject({ code: 'sdk-call-invalid' });
    expect(errorOf(() => checkKeyframes({ filter: 'blur(1px)"' }))).toMatchObject({ code: 'sdk-call-invalid' });
  });

  it.each(['backgroundImage', 'boxShadow', 'left', 'content'])('свойство %s — sdk-call-invalid', (name) => {
    expect(errorOf(() => checkKeyframes({ [name]: '1' }))).toMatchObject({
      code: 'sdk-call-invalid',
      message: `ctx.animate: свойство ${name} анимировать нельзя`,
    });
  });

  it.each(['url(https://evil.example/x.png)', 'URL(/x)', '"a"', "'a'", '\\75 rl(x)'])(
    'значение %s — sdk-call-invalid',
    (value) => {
      expect(errorOf(() => checkKeyframes({ color: value }))).toMatchObject({ code: 'sdk-call-invalid' });
      expect(errorOf(() => checkKeyframes({ color: ['#000', value] }))).toMatchObject({ code: 'sdk-call-invalid' });
    },
  );
});

describe('ctx.animate', () => {
  let started: StartedCore | null = null;
  let failures: ReturnType<typeof watchFailures>;

  beforeEach(() => {
    document.head.innerHTML = configTag('live');
    failures = watchFailures();
  });

  afterEach(() => {
    started?.stop();
    started = null;
    failures.stop();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('провайдер получает узел своей секции, кадры, параметры, сигнал экземпляра и режим', async () => {
    const calls: Parameters<AnimateProvider>[] = [];
    const provider: AnimateProvider = (...args) => {
      calls.push(args);
      return done(...args);
    };
    const section = placeSection('shop:a', 'a', '<p data-ref="box"></p>');
    started = start({
      parts: [behaviors({ list: [], animate: provider })],
      sections: [
        entry('shop:a', {
          mount: (el, ctx) => {
            const box = el.ref('box');
            if (box) ctx.animate(box, { opacity: [0, 1] }, { duration: 600, easing: 'power2.out' });
          },
        }),
      ],
    });
    await tick();
    const [nodes, keyframes, options, signal, mode] = calls[0] ?? [];
    expect(nodes).toEqual([section.querySelector('p')]);
    expect(keyframes).toEqual({ opacity: [0, 1] });
    expect(options).toEqual({ duration: 600, easing: 'power2.out' });
    expect(mode).toBe('live');
    expect(signal?.aborted).toBe(false);
    section.remove();
    await tick();
    expect(signal?.aborted).toBe(true);
    expect(failures.details).toEqual([]);
  });

  it('элемент чужой секции — сбой sdk-call-invalid, провайдер не вызван', async () => {
    let foreign: El | null = null;
    let calls = 0;
    const provider: AnimateProvider = (...args) => {
      calls += 1;
      return done(...args);
    };
    placeSection('shop:a', 'a', '<p data-ref="box"></p>');
    placeSection('shop:b', 'b');
    started = start({
      parts: [behaviors({ list: [], animate: provider })],
      sections: [
        entry('shop:a', { mount: (el) => void (foreign = el.ref('box')) }),
        entry('shop:b', {
          mount: (_el, ctx) => {
            if (foreign) ctx.animate(foreign, { opacity: [0, 1] });
          },
        }),
      ],
    });
    await tick();
    expect(calls).toBe(0);
    expect(failures.details).toMatchObject([{ section: 'shop:b', stage: 'mount' }]);
    expect(failures.details[0]?.message).toContain('ctx.animate: элемент не из этой секции');
  });

  it('список элементов — провайдер получает все узлы по порядку; пустой список — пустой вызов', async () => {
    const calls: Parameters<AnimateProvider>[] = [];
    const provider: AnimateProvider = (...args) => {
      calls.push(args);
      return done(...args);
    };
    const section = placeSection('shop:a', 'a', '<i data-ref="i"></i><i data-ref="i"></i><i data-ref="i"></i>');
    started = start({
      parts: [behaviors({ list: [], animate: provider })],
      sections: [
        entry('shop:a', {
          mount: (el, ctx) => {
            ctx.animate(el.refs('i'), { opacity: [0, 1] }, { stagger: 80 });
            ctx.animate([], { opacity: [0, 1] });
          },
        }),
      ],
    });
    await tick();
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[0]).toEqual([...section.querySelectorAll('i')]);
    expect(calls[0]?.[2]).toEqual({ stagger: 80 });
    expect(calls[1]?.[0]).toEqual([]);
    expect(failures.details).toEqual([]);
  });

  it('ctx.split: провайдер получает узел и способ; lines — Promise, куски приходят обёртками своей секции', async () => {
    const calls: [Element, string][] = [];
    const split: SplitProvider = (node, by) => {
      calls.push([node, by]);
      const pieces = node instanceof HTMLElement ? [node] : [];
      return by === 'lines' ? Promise.resolve(pieces) : pieces;
    };
    const section = placeSection('shop:a', 'a', '<p data-ref="t">a b</p>');
    let sync: readonly El[] = [];
    let lines: readonly El[] = [];
    started = start({
      parts: [behaviors({ list: [], split })],
      sections: [
        entry('shop:a', {
          mount: async (el, ctx) => {
            const title = el.ref('t');
            if (!title) return;
            sync = ctx.split(title, 'words');
            lines = await ctx.split(title, 'lines');
          },
        }),
      ],
    });
    await tick();
    expect(calls.map(([node, by]) => [node === section.querySelector('p'), by])).toEqual([
      [true, 'words'],
      [true, 'lines'],
    ]);
    expect([sync.length, lines.length]).toEqual([1, 1]);
    expect(failures.details).toEqual([]);
  });

  it.each([
    ['часть behaviors без провайдера', true],
    ['части behaviors нет', false],
  ])('ctx.split: %s — сбой part-unknown с текстом для автора секции', async (_name, withPart) => {
    placeSection('shop:a', 'a');
    started = start({
      parts: withPart ? [behaviors({ list: [] })] : [],
      sections: [entry('shop:a', { mount: (el, ctx) => void ctx.split(el, 'chars') })],
    });
    await tick();
    expect(failures.details[0]?.message).toContain('ctx.split: на странице нет кода анимаций');
  });

  it('ctx.split: чужой элемент — сбой sdk-call-invalid, провайдер не вызван', async () => {
    let foreign: El | null = null;
    let calls = 0;
    const split: SplitProvider = () => {
      calls += 1;
      return [];
    };
    placeSection('shop:a', 'a', '<p data-ref="t"></p>');
    placeSection('shop:b', 'b');
    started = start({
      parts: [behaviors({ list: [], split })],
      sections: [
        entry('shop:a', { mount: (el) => void (foreign = el.ref('t')) }),
        entry('shop:b', { mount: (_el, ctx) => void (foreign && ctx.split(foreign, 'words')) }),
      ],
    });
    await tick();
    expect(calls).toBe(0);
    expect(failures.details[0]?.message).toContain('ctx.split: элемент не из этой секции');
  });

  it('свойство вне списка — сбой sdk-call-invalid (проверку делает провайдер animate.js)', async () => {
    placeSection('shop:a', 'a');
    started = start({
      parts: [behaviors({ list: [], animate: animateProvider })],
      sections: [entry('shop:a', { mount: (el, ctx) => void ctx.animate(el, { left: ['0px', '10px'] }) })],
    });
    await tick();
    expect(failures.details).toMatchObject([{ section: 'shop:a' }]);
    expect(failures.details[0]?.message).toContain('свойство left');
  });

  it.each([
    ['часть behaviors без провайдера', true],
    ['части behaviors нет', false],
  ])('%s — сбой part-unknown с текстом для автора секции', async (_name, withPart) => {
    placeSection('shop:a', 'a');
    started = start({
      parts: withPart ? [behaviors({ list: [] })] : [],
      sections: [entry('shop:a', { mount: (el, ctx) => void ctx.animate(el, { opacity: [0, 1] }) })],
    });
    await tick();
    expect(failures.details).toMatchObject([{ section: 'shop:a' }]);
    expect(failures.details[0]?.message).toContain('ctx.animate: на странице нет кода анимаций');
  });
});
