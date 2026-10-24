import { describe, expect, it } from 'vitest';
import { parseBuildInputs } from '../src/inputs';
import type { WrapperView } from '../src/sections-render';
import { codeInputs } from './support-code';

// Полные виды закрепления (блок 7, часть 7б, Р7б-1) проходят строгую схему входов сборки: классы — безопасные токены,
// атрибуты — data-* с простыми значениями. Те же значения закреплены в wrapper-sticky.test.ts пакета секций (STICKY_VIEW):
// меняешь таблицу — меняй оба теста.
const PINNED = ['sticky', 'top-0', 'z-50'];
const VIEWS: Record<string, WrapperView> = {
  always: { classes: ['py-section', ...PINNED], attributes: {} },
  'scroll-up': {
    classes: [
      'py-section',
      ...PINNED,
      'transition-transform',
      'duration-300',
      'motion-reduce:transition-none',
      'data-[hidden]:-translate-y-full',
    ],
    attributes: { 'data-behavior': 'sticky-header', 'data-mode': 'scroll-up' },
  },
};

describe('закрепление во входах сборки', () => {
  it.each(Object.entries(VIEWS))('%s: вид проходит схему входов без изменений', (_name, wrapper) => {
    const inputs = codeInputs((changed) => {
      changed.code.pages.home = changed.code.pages.home.map((instance, index) =>
        index === 1 ? { ...instance, wrapper } : instance,
      );
    });
    expect(parseBuildInputs(inputs).code.pages.home[1]?.wrapper).toEqual(wrapper);
  });
});
