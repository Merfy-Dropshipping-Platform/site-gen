import { renderSection, sectionCss, sha256, type PlacedSection, type SectionsRender } from '@merfy/storefront-build';
import { platformDictionary } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import { STICKY_VALUES, STICKY_VIEW, isDefaultWrapperView, resolveWrapperView } from '../src/wrapper';

// Закрепление в виде обёртки (блок 7, часть 7б, Р7б-1): значение sticky из ревизии → классы и атрибуты <merfy-section> →
// разметка и CSS страницы. Полные виды закреплены и в тесте входов сборки (storefront-build, sections-wrapper-sticky.test.ts):
// меняешь таблицу STICKY_VIEW — меняй оба теста.
const ALL = ['scheme', 'padding', 'sticky'] as const;
const PINNED = ['sticky', 'top-0', 'z-50'];
const SLIDING = [
  'transition-transform',
  'duration-300',
  'motion-reduce:transition-none',
  'data-[hidden]:-translate-y-full',
];
const BEHAVIOR = { 'data-behavior': 'sticky-header', 'data-mode': 'scroll-up' };
const viewOf = (edits: unknown) => resolveWrapperView({ wrapper: [...ALL] }, edits);
const keysOf = (invalid: string[]) => invalid.map((text) => text.split(':')[0]);

describe('таблица закрепления', () => {
  it('описаны все значения каталога: none пустое, остальные что-то добавляют', () => {
    expect(Object.keys(STICKY_VIEW).sort()).toEqual([...STICKY_VALUES].sort());
    for (const value of STICKY_VALUES) {
      expect(STICKY_VIEW[value].classes.length > 0).toBe(value !== 'none');
    }
  });
});

describe('закрепление в виде обёртки', () => {
  it('always: после отступа из токена — sticky top-0 z-50, атрибутов нет', () => {
    expect(viewOf({ sticky: 'always' })).toEqual({
      view: { classes: ['py-section', ...PINNED], attributes: {} },
      invalid: [],
    });
  });

  it('scroll-up: те же классы, переход, сдвиг по data-hidden и поведение на самой обёртке', () => {
    expect(viewOf({ sticky: 'scroll-up' })).toEqual({
      view: { classes: ['py-section', ...PINNED, ...SLIDING], attributes: BEHAVIOR },
      invalid: [],
    });
  });

  it('none — вид по умолчанию без закрепления, замечаний нет', () => {
    const resolved = viewOf({ sticky: 'none' });
    expect(isDefaultWrapperView(resolved.view)).toBe(true);
    expect(resolved.invalid).toEqual([]);
  });

  // Блок 15, часть 15в (Р15в-2): умолчание — «При прокрутке вверх», как конструктор и генератор пяти тем на проде.
  it('правки без sticky и отсутствие правок — «При прокрутке вверх», замечаний нет', () => {
    for (const edits of [{}, undefined]) {
      expect(viewOf(edits)).toEqual({
        view: { classes: ['py-section', ...PINNED, ...SLIDING], attributes: BEHAVIOR },
        invalid: [],
      });
    }
  });

  it('порядок классов: схема, отступы, закрепление; самый длинный вид укладывается в предел схемы входов (16)', () => {
    const resolved = viewOf({ scheme: 'scheme-2', padding: { top: 16, bottom: 24 }, sticky: 'scroll-up' });
    expect(resolved.view.classes).toEqual(['color-scheme-2', 'pt-4', 'pb-6', ...PINNED, ...SLIDING]);
    expect(resolved.view.classes.length).toBeLessThanOrEqual(16);
    expect(resolved.invalid).toEqual([]);
  });

  it('секция без sticky в списке wrapper (и без ключа wrapper): закрепления нет, в замечаниях — sticky', () => {
    const edits = { sticky: 'always' };
    for (const resolved of [
      resolveWrapperView({}, edits),
      resolveWrapperView({ wrapper: ['scheme', 'padding'] }, edits),
    ]) {
      expect(resolved.view).toEqual({ classes: ['py-section'], attributes: {} });
      expect(keysOf(resolved.invalid)).toEqual(['sticky']);
    }
  });

  it('значение не из none / scroll-up / always — вид по умолчанию («При прокрутке вверх»), замечание про sticky', () => {
    for (const edits of [{ sticky: 'sometimes' }, { sticky: 5 }]) {
      const resolved = viewOf(edits);
      expect(resolved.view).toEqual(viewOf({ sticky: 'scroll-up' }).view);
      expect(keysOf(resolved.invalid)).toEqual(['sticky']);
    }
  });
});

const MODULE = 'export default 1;';
const HASH = sha256(Buffer.from(MODULE, 'utf8'));
const SECTIONS: SectionsRender = {
  modules: new Map([[HASH, MODULE]]),
  render: () => Promise.resolve('<nav class="flex">Меню</nav>'),
};
const placedOf = (edits: unknown): PlacedSection => ({
  id: 'header-1',
  name: 'shop:header',
  hash: HASH,
  settings: {},
  wrapper: viewOf(edits).view,
});
const wrapped = (classes: string, attributes = ''): string =>
  `<merfy-section data-section="shop:header" data-section-id="header-1" class="${classes}"${attributes}><nav class="flex">Меню</nav></merfy-section>`;

describe('закрепление на странице', () => {
  it('none — прежняя обёртка с одним классом py-section', async () => {
    expect(await renderSection(placedOf({ sticky: 'none' }), SECTIONS, 'live')).toBe(wrapped('py-section'));
  });

  it('нет правки — как scroll-up: классы перехода и сдвига, data-behavior и data-mode', async () => {
    expect(await renderSection(placedOf(undefined), SECTIONS, 'live')).toBe(
      await renderSection(placedOf({ sticky: 'scroll-up' }), SECTIONS, 'live'),
    );
  });

  it('always — sticky top-0 z-50, без поведения', async () => {
    expect(await renderSection(placedOf({ sticky: 'always' }), SECTIONS, 'live')).toBe(
      wrapped('py-section sticky top-0 z-50'),
    );
  });

  it('scroll-up — классы перехода и сдвига, data-behavior и data-mode; в превью то же', async () => {
    const classes =
      'py-section sticky top-0 z-50 transition-transform duration-300 motion-reduce:transition-none data-[hidden]:-translate-y-full';
    const attributes = ' data-behavior="sticky-header" data-mode="scroll-up"';
    for (const mode of ['live', 'preview'] as const) {
      expect(await renderSection(placedOf({ sticky: 'scroll-up' }), SECTIONS, mode)).toBe(wrapped(classes, attributes));
    }
  });

  it('CSS страницы содержит правила классов закрепления', async () => {
    const html = await renderSection(placedOf({ sticky: 'scroll-up' }), SECTIONS, 'live');
    const css = await sectionCss(html, platformDictionary);
    for (const selector of ['.sticky', '.top-0', '.z-50', '.transition-transform', '.duration-300']) {
      expect(css).toContain(selector);
    }
    expect(css).toContain('data-hidden');
    expect(css).toContain('prefers-reduced-motion');
  });
});
