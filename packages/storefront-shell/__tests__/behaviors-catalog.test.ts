import { describe, expect, it } from 'vitest';
import { BEHAVIORS, EASINGS, PRESETS, PRESET_PARAMS, type Library } from '../src/core/behaviors/catalog';
import { readParams } from '../src/core/behaviors/params';

// Каталог поведений и пресетов (design.md блока 6, разделы 1, 3–9) и чтение параметров с корня поведения. Каталог —
// договор с проверкой при сохранении и сборкой (часть 6б) и документацией (блок 14): тест закрепляет его значения.
function element(html: string): HTMLElement {
  const box = document.createElement('div');
  box.innerHTML = html;
  const first = box.firstElementChild;
  if (!(first instanceof HTMLElement)) throw new Error('нет элемента');
  return first;
}

const using = (library: Library): string[] =>
  Object.entries(BEHAVIORS)
    .filter(([, spec]) => spec.libraries.includes(library))
    .map(([name]) => name)
    .sort();

describe('каталог поведений', () => {
  it('девять поведений: search — в блоке 11, zoom — в блоке 8', () => {
    expect(Object.keys(BEHAVIORS).sort()).toEqual([
      'accordion',
      'card-photos',
      'carousel',
      'dialog',
      'nav-menu',
      'quantity',
      'sticky-header',
      'tabs',
      'video',
    ]);
  });

  it('Embla — только у слайдера; Motion — у слайдера, аккордеона и окна; на самой секции — только шапка', () => {
    expect(using('embla')).toEqual(['carousel']);
    expect(using('motion')).toEqual(['accordion', 'carousel', 'dialog']);
    expect(
      Object.entries(BEHAVIORS)
        .filter(([, spec]) => spec.onSection)
        .map(([name]) => name),
    ).toEqual(['sticky-header']);
  });

  it('умолчание каждого параметра — в его границах', () => {
    const params = Object.values(BEHAVIORS).flatMap((spec) => Object.values(spec.params));
    for (const param of params) {
      if (param.kind === 'enum') expect(param.values).toContain(param.default);
      if (param.kind === 'int') {
        expect(Number.isInteger(param.default)).toBe(true);
        expect(param.default).toBeGreaterThanOrEqual(param.min);
        expect(param.default).toBeLessThanOrEqual(param.max);
      }
    }
  });

  it('кривые — массивы Безье; x — от 0 до 1; значения факта 22 и замера смены Fade', () => {
    for (const [x1, , x2] of Object.values(EASINGS)) {
      expect(x1).toBeGreaterThanOrEqual(0);
      expect(x2).toBeLessThanOrEqual(1);
    }
    expect(EASINGS['power2.out']).toEqual([0.33, 1, 0.68, 1]);
    expect(EASINGS['back.out']).toEqual([0.33, 1.36, 0.66, 1]);
    expect(EASINGS.decelerate).toEqual([0, 0, 0.2, 1]);
    expect(EASINGS['ease-out']).toEqual([0, 0, 0.58, 1]);
  });

  it('пресеты — таблица раздела 9', () => {
    expect(PRESETS.appear).toMatchObject({ target: 'self', y: 24, duration: 600, easing: 'power2.out', stagger: 80 });
    expect(PRESETS['appear-group']).toMatchObject({ target: 'children', duration: 500, stagger: 70 });
    expect(PRESETS['appear-side']).toMatchObject({
      target: 'section',
      x: 32,
      y: 24,
      duration: 700,
      visibleAtStart: 'show',
    });
    expect(PRESETS['fade-up']).toMatchObject({ y: 20, duration: 650, easing: 'material', amount: 0.08 });
    expect(PRESETS['slide-down']).toMatchObject({ y: -16, duration: 550, margin: '0px 0px -36px 0px' });
    expect([PRESETS['load-1'].delay, PRESETS['load-2'].delay, PRESETS['load-3'].delay]).toEqual([50, 150, 280]);
    expect(PRESETS.letters).toMatchObject({ target: 'letters', y: 0.4, unit: 'em', stagger: 30 });
    expect(PRESET_PARAMS.delay).toEqual({ kind: 'int', min: 0, max: 5000, default: 0 });
  });
});

describe('readParams', () => {
  const carousel = BEHAVIORS.carousel.params;

  it('нет атрибутов — умолчания каталога', () => {
    expect(readParams(element('<div data-behavior="carousel"></div>'), carousel)).toEqual({
      effect: 'slide',
      change: '700',
      autoplay: 0,
      loop: true,
      drag: true,
    });
  });

  it('значения из data-*: перечисление, целое, да и нет', () => {
    const root = element(
      '<div data-behavior="carousel" data-effect="fade" data-change="500" data-autoplay="5" data-loop="false" data-drag=""></div>',
    );
    expect(readParams(root, carousel)).toEqual({ effect: 'fade', change: '500', autoplay: 5, loop: false, drag: true });
  });

  it('неверное значение — умолчание; целое вне границ — ближайшая граница', () => {
    const wrong = element('<div data-effect="zoom" data-autoplay="2.5" data-loop="yes"></div>');
    expect(readParams(wrong, carousel)).toMatchObject({ effect: 'slide', autoplay: 0, loop: true });
    expect(readParams(element('<div data-autoplay="120"></div>'), carousel).autoplay).toBe(60);
    expect(readParams(element('<div data-autoplay="-3"></div>'), carousel).autoplay).toBe(0);
  });

  it('строка и список через пробелы; имя параметра с дефисом', () => {
    expect(readParams(element('<div></div>'), BEHAVIORS.tabs.params).value).toBeNull();
    expect(readParams(element('<div data-value="care"></div>'), BEHAVIORS.tabs.params).value).toBe('care');
    const card = element('<a data-photos="  /p/1.jpg   /p/2.jpg " data-hover-next="false"></a>');
    expect(readParams(card, BEHAVIORS['card-photos'].params)).toEqual({
      photos: ['/p/1.jpg', '/p/2.jpg'],
      'hover-next': false,
    });
    expect(readParams(element('<nav data-open-on="hover"></nav>'), BEHAVIORS['nav-menu'].params)).toEqual({
      'open-on': 'hover',
    });
  });

  it('результат заморожен, лишних ключей нет; delay пресета', () => {
    const params = readParams(element('<div data-autoplay="3" data-extra="1"></div>'), carousel);
    expect(Object.isFrozen(params)).toBe(true);
    expect(Object.keys(params).sort()).toEqual(['autoplay', 'change', 'drag', 'effect', 'loop']);
    expect(readParams(element('<p data-animate="appear" data-delay="300"></p>'), PRESET_PARAMS)).toEqual({
      delay: 300,
    });
  });
});
