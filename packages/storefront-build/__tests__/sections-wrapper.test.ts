import { sha256 } from '../src/canonical';
import { describe, expect, it } from 'vitest';
import { parseBuildInputs, type BuildInputs } from '../src/inputs';
import { renderSection, type PlacedSection, type SectionsRender, type WrapperView } from '../src/sections-render';
import { codeInputs } from './support-code';

// Обёртка секции: классы и атрибуты из входов (часть 5 блока 1 «Секций и SDK», Р1-5-7, Р1-5-8).
const MODULE = 'export default 1;';
const HASH = sha256(Buffer.from(MODULE, 'utf8'));
const SECTIONS: SectionsRender = { modules: new Map([[HASH, MODULE]]), render: () => Promise.resolve('<p>x</p>') };
const PLACED: PlacedSection = { id: 'hero-1', name: 'shop:hero', hash: HASH, settings: {} };

describe('печать обёртки', () => {
  it('без wrapper — прежний class="py-section"', async () => {
    expect(await renderSection(PLACED, SECTIONS, 'live')).toBe(
      '<merfy-section data-section="shop:hero" data-section-id="hero-1" class="py-section"><p>x</p></merfy-section>',
    );
  });

  it('классы и атрибуты — из wrapper, значения экранируются', async () => {
    const placed = {
      ...PLACED,
      wrapper: { classes: ['color-scheme-2', 'pt-10', 'pb-20'], attributes: { 'data-mode': 'a"b' } },
    };
    expect(await renderSection(placed, SECTIONS, 'live')).toBe(
      '<merfy-section data-section="shop:hero" data-section-id="hero-1" class="color-scheme-2 pt-10 pb-20" data-mode="a&quot;b"><p>x</p></merfy-section>',
    );
  });

  it('пустой список классов — без атрибута class', async () => {
    const placed = { ...PLACED, wrapper: { classes: [], attributes: {} } };
    expect(await renderSection(placed, SECTIONS, 'live')).toBe(
      '<merfy-section data-section="shop:hero" data-section-id="hero-1"><p>x</p></merfy-section>',
    );
  });

  it('секция, упавшая в превью, — тоже в своей обёртке с классами', async () => {
    const failing: SectionsRender = { modules: SECTIONS.modules, render: () => Promise.reject(new Error('boom')) };
    const placed = { ...PLACED, wrapper: { classes: ['pt-10'], attributes: {} } };
    expect(await renderSection(placed, failing, 'preview')).toContain('class="pt-10"');
  });
});

describe('wrapper во входах сборки', () => {
  // Входы стенда с кодом магазина; у второго экземпляра главной — проверяемый вид обёртки (типизированно, без any).
  const withWrapper = (wrapper: WrapperView): BuildInputs =>
    codeInputs((changed) => {
      changed.code.pages.home = changed.code.pages.home.map((instance, index) =>
        index === 1 ? { ...instance, wrapper } : instance,
      );
    });

  it('безопасные классы и атрибуты data-* проходят', () => {
    const wrapper = {
      classes: [
        'color-scheme-2',
        'pt-10',
        'sticky',
        'data-[hidden]:-translate-y-full',
        'motion-reduce:transition-none',
      ],
      attributes: { 'data-behavior': 'sticky-header', 'data-mode': 'scroll-up' },
    };
    expect(parseBuildInputs(withWrapper(wrapper)).code.pages.home?.[1]?.wrapper).toEqual(wrapper);
  });

  // «Ширина» секции (базовые секции, 29.10): обёртка задаёт --width-page своей секции числом в px.
  it('ширина секции — свойство --width-page в px проходит', () => {
    const wrapper = { classes: ['py-section', '[--width-page:768px]'], attributes: {} };
    expect(parseBuildInputs(withWrapper(wrapper)).code.pages.home?.[1]?.wrapper).toEqual(wrapper);
  });

  it.each([
    ['свойство с пробелом', { classes: ['[--width-page:768 px]'], attributes: {} }],
    ['свойство не в px', { classes: ['[--width-page:var(--x)]'], attributes: {} }],
    ['свойство не переменная', { classes: ['[color:red]'], attributes: {} }],
    ['класс с пробелом', { classes: ['a b'], attributes: {} }],
    ['класс с кавычкой', { classes: ['a"b'], attributes: {} }],
    ['класс с <', { classes: ['<b'], attributes: {} }],
    ['атрибут не data-', { attributes: { onclick: 'x' }, classes: [] }],
    ['значение атрибута с кавычкой', { attributes: { 'data-a': 'a"b' }, classes: [] }],
    ['лишний ключ', { classes: [], attributes: {}, style: 'x' }],
  ])('отказ: %s', (_name, wrapper) => {
    expect(() => parseBuildInputs(withWrapper(wrapper))).toThrow();
  });
});
