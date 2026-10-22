import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { behaviors } from '../src/core/behaviors/part';
import type { AnimateProvider } from '../src/core/behaviors/types';
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

  it.each(['backgroundImage', 'filter', 'left', 'content'])('свойство %s — sdk-call-invalid', (name) => {
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
    const [node, keyframes, options, signal, mode] = calls[0] ?? [];
    expect(node).toBe(section.querySelector('p'));
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

  it('свойство вне списка — сбой sdk-call-invalid', async () => {
    placeSection('shop:a', 'a');
    started = start({
      parts: [behaviors({ list: [], animate: done })],
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
