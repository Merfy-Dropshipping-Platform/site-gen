import { describe, expect, it } from 'vitest';
import { DEFAULT_WRAPPER_VIEW, STICKY_VIEW, isDefaultWrapperView, resolveWrapper, wrapperView } from '../src/wrapper';

// Значения общих настроек и вид обёртки (часть 5 блока 1 «Секций и SDK», Р1-5-6, Р1-5-7, design.md 3.15).
const BOTH = ['scheme', 'padding'] as const;

describe('resolveWrapper', () => {
  it('правки из списка секции — значения; null у padding — как нет ключа', () => {
    expect(resolveWrapper(BOTH, { scheme: 'scheme-2', padding: { top: 40, bottom: 80 } })).toEqual({
      values: { scheme: 'scheme-2', padding: { top: 40, bottom: 80 } },
      invalid: [],
    });
    expect(resolveWrapper(BOTH, { padding: null })).toEqual({ values: {}, invalid: [] });
  });

  it('чего нет в списке, неверное значение и неизвестный ключ — в invalid с ключом; значения нет', () => {
    const result = resolveWrapper(['scheme'], { padding: { top: 40, bottom: 40 }, scheme: 'Схема 2', width: 3 });
    expect(result.values).toEqual({});
    expect(result.invalid.map((text) => text.split(':')[0]).sort()).toEqual(['padding', 'scheme', 'width']);
  });

  it('не объект — всё в invalid одной строкой', () => {
    expect(resolveWrapper(BOTH, 'scheme-2').invalid).toHaveLength(1);
  });
});

describe('wrapperView', () => {
  it('без правок: отступ из токена темы, схемы нет', () => {
    expect(wrapperView(BOTH, {})).toEqual({ classes: ['py-section'], attributes: {} });
    expect(isDefaultWrapperView(wrapperView(BOTH, {}))).toBe(true);
    expect(DEFAULT_WRAPPER_VIEW).toEqual({ classes: ['py-section'], attributes: {} });
  });

  it('схема и отступы: color-scheme-2 pt-10 pb-20 (design.md 3.5)', () => {
    expect(wrapperView(BOTH, { scheme: 'scheme-2', padding: { top: 40, bottom: 80 } })).toEqual({
      classes: ['color-scheme-2', 'pt-10', 'pb-20'],
      attributes: {},
    });
  });

  it('отступ 0 — pt-0 pb-0, а не py-section', () => {
    expect(wrapperView(BOTH, { padding: { top: 0, bottom: 0 } }).classes).toEqual(['pt-0', 'pb-0']);
  });

  it('только схема: py-section остаётся (отступ из токена)', () => {
    expect(wrapperView(BOTH, { scheme: 'scheme-1' }).classes).toEqual(['color-scheme-1', 'py-section']);
  });

  it('секция без padding в списке — отступа нет совсем', () => {
    expect(wrapperView(['scheme'], { scheme: 'scheme-1' }).classes).toEqual(['color-scheme-1']);
    expect(wrapperView([], {}).classes).toEqual([]);
    expect(isDefaultWrapperView(wrapperView([], {}))).toBe(false);
  });

  it('в 5а закрепление ничего не добавляет: все три значения — пустые строки таблицы (классы — часть 7б)', () => {
    expect(STICKY_VIEW).toEqual({
      none: { classes: [], attributes: {} },
      'scroll-up': { classes: [], attributes: {} },
      always: { classes: [], attributes: {} },
    });
    for (const sticky of ['none', 'scroll-up', 'always'] as const) {
      expect(wrapperView(['scheme', 'padding', 'sticky'], { sticky })).toEqual({
        classes: ['py-section'],
        attributes: {},
      });
    }
  });
});
