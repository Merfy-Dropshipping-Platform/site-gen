import { platformDictionary, readSectionTokens, sectionTailwindTheme } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import { sectionCss } from '../src/section-css';
import { classSystem } from '../src/tailwind-system';

// Один Tailwind для проверки классов и сборки (блок 4 «Секций и SDK», Р4-3; факты 14–17 design.md).
const WITH_CSS = [
  'p-4',
  'font-bold',
  'max-w-7xl',
  'max-md:hidden',
  'data-open:block',
  'group-data-picked:not-data-match:opacity-35',
  'bg-primary',
  'text-5xl',
  'rounded-card',
  'shadow-card',
  'p-section',
  'opacity-0',
  'opacity-80',
  'font-body',
];
const WITHOUT_CSS = [
  'text-10xl',
  'bg-red-600',
  'bg-white',
  'text-white',
  'font-sans',
  'rounded-lg',
  'shadow-lg',
  'ring-blue-500',
  'group',
  'peer',
  'color-scheme-2',
  'scheme-card',
  'js-open',
  'drop-shadow-lg',
];
const SWATCH_THEME = sectionTailwindTheme(
  readSectionTokens(platformDictionary, {
    'custom-swatch': { kind: 'color', about: 'Обводка образца ткани', derive: { rule: 'alias', from: 'primary' } },
  }).tokens,
);

describe('classSystem', () => {
  it('классы словаря и служебные шкалы — с CSS', async () => {
    const system = await classSystem(platformDictionary, '');
    expect(
      system
        .cssOf(WITH_CSS)
        .map((css, i) => (css === null ? WITH_CSS[i] : null))
        .filter(Boolean),
    ).toEqual([]);
  });

  it('классы вне словаря, классы платформы и тени без сброса — без CSS', async () => {
    const system = await classSystem(platformDictionary, '');
    expect(
      system
        .cssOf(WITHOUT_CSS)
        .map((css, i) => (css === null ? null : WITHOUT_CSS[i]))
        .filter(Boolean),
    ).toEqual([]);
  });

  it('имена для подсказки: шкала текста до text-9xl (шаг 6), встроенных text-red-600 нет', async () => {
    const names = (await classSystem(platformDictionary, '')).classNames();
    expect(names).toContain('text-5xl');
    expect(names).toContain('text-9xl');
    expect(names).not.toContain('text-red-600');
  });

  it('свои значения размеров и движение словаря — с CSS', async () => {
    const system = await classSystem(platformDictionary, '');
    const [poster, marquee] = system.cssOf(['text-[clamp(4rem,18vw,16rem)]', 'animate-marquee']);
    expect(poster).toContain('font-size: clamp(4rem, 18vw, 16rem)');
    expect(marquee).toContain('merfy-marquee');
  });

  it('класс токена секции — только со строками @theme секции; кэш по паре', async () => {
    expect((await classSystem(platformDictionary, '')).cssOf(['bg-custom-swatch'])).toEqual([null]);
    const withSwatch = await classSystem(platformDictionary, SWATCH_THEME);
    expect(withSwatch.cssOf(['bg-custom-swatch'])[0]).toContain('var(--custom-swatch)');
    expect(await classSystem(platformDictionary, SWATCH_THEME)).toBe(withSwatch);
  });
});

describe('sectionCss со строками токенов секции', () => {
  it('класс токена секции получает CSS', async () => {
    const css = await sectionCss('<div class="bg-custom-swatch p-4"></div>', platformDictionary, SWATCH_THEME);
    expect(css).toContain('.bg-custom-swatch');
    expect(css).toContain('var(--custom-swatch)');
  });

  it('без строк — класса токена секции нет, остальное как было', async () => {
    const css = await sectionCss('<div class="bg-custom-swatch p-4"></div>', platformDictionary);
    expect(css).not.toContain('.bg-custom-swatch');
    expect(css).toContain('.p-4');
  });
});
