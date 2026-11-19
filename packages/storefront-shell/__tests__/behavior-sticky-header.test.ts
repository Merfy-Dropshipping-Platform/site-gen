import { afterEach, describe, expect, it, vi } from 'vitest';
import { behaviors } from '../src/core/behaviors/part';
import { stickyHeader } from '../src/core/behaviors/sticky-header';
import { start, type StartedCore } from '../src/core/start';
import { configTag } from './core-support';

// Шапка при прокрутке: при запуске вёрстку не читаем (замер 19.11.2026: чтение scrollY и getBoundingClientRect на
// запуске считало раскладку страницы внутри задачи запуска секций), data-hidden — по прокрутке.
const HEIGHT = 80;

let started: StartedCore | null = null;

function open(mode: string): HTMLElement {
  document.head.innerHTML = configTag('live');
  document.body.innerHTML = `<merfy-section data-section="shop:header" data-section-id="header" data-behavior="sticky-header" data-mode="${mode}"></merfy-section>`;
  started = start({ parts: [behaviors({ list: [stickyHeader] })], sections: [] });
  const header = document.querySelector('merfy-section');
  if (!(header instanceof HTMLElement)) throw new Error('нет шапки');
  vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, HEIGHT));
  return header;
}

const scrollTo = (y: number): void => {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  window.dispatchEvent(new Event('scroll'));
};

afterEach(() => {
  started?.stop();
  started = null;
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'scrollY');
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('поведение sticky-header', () => {
  it('при запуске не читает вёрстку: ни scrollY, ни getBoundingClientRect', () => {
    const scrollReads = vi.fn(() => 0);
    Object.defineProperty(window, 'scrollY', { get: scrollReads, configurable: true });
    const rectReads = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    open('scroll-up');
    expect(scrollReads).not.toHaveBeenCalled();
    expect(rectReads).not.toHaveBeenCalled();
  });

  it('scroll-up: вниз ниже своей высоты — data-hidden, вверх — снят', () => {
    const header = open('scroll-up');
    scrollTo(60);
    expect(header.hasAttribute('data-hidden')).toBe(false);
    scrollTo(400);
    expect(header.hasAttribute('data-hidden')).toBe(true);
    scrollTo(300);
    expect(header.hasAttribute('data-hidden')).toBe(false);
  });

  it('режим читается на каждой прокрутке: не scroll-up — data-hidden снят', () => {
    const header = open('scroll-up');
    scrollTo(400);
    expect(header.hasAttribute('data-hidden')).toBe(true);
    header.setAttribute('data-mode', 'always');
    scrollTo(900);
    expect(header.hasAttribute('data-hidden')).toBe(false);
  });

  it('после остановки ядра прокрутка шапку не трогает', () => {
    const header = open('scroll-up');
    started?.stop();
    scrollTo(400);
    expect(header.hasAttribute('data-hidden')).toBe(false);
  });
});
