import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Баг тестера #14 (18.09): «Панель фильтра открывается за правый край экрана.
 * Тема: Rose. Страница: Коллекция, ширина 375. Панель шириной 180 привязана к
 * левому краю своего фильтра; у фильтра на позиции 225 правый край уходит на
 * 405 при экране 375, содержимое обрезано».
 *
 * Разметка это подтверждает: обёртка панели — `absolute left-0 top-full
 * w-[180px]` внутри `<details class="relative">`, то есть привязана к своему
 * фильтру. На широком экране это верно, на 375 фильтр правой половины уводит
 * панель за край.
 *
 * Правка: на узких экранах (`max-md`) опорой становится не сам фильтр, а строка
 * фильтров (`<details>` → `max-md:static`), а панель растягивается по ней
 * (`max-md:left-0 max-md:right-0 max-md:w-auto`). Строка уже лежит в контейнере
 * с полями, поэтому за экран выйти нечему. Десктоп не меняется.
 */
const THEMES = ['rose', 'flux', 'bloom', 'satin', 'vanilla'] as const;

const portSource = (theme: string): string | null => {
  const p = join(__dirname, '..', '..', `theme-${theme}`, 'blocks', 'Catalog', 'Catalog.astro');
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
};

describe('панель фильтра не уезжает за край на узком экране', () => {
  it.each(THEMES)('%s: ни одна панель шириной 180px не привязана только к своему фильтру', (theme) => {
    const src = portSource(theme);
    if (!src) return; // тема без своего порта каталога
    const wrappers = [...src.matchAll(/class="(absolute[^"]*top-full[^"]*)"/g)].map((m) => m[1]);
    const unguarded = wrappers.filter((c) => c.includes('w-[180px]') && !c.includes('max-md:'));
    expect(unguarded).toEqual([]);
  });

  it.each(THEMES)('%s: на узком экране опора позиционирования — строка фильтров', (theme) => {
    const src = portSource(theme);
    if (!src) return;
    const details = [...src.matchAll(/<details[^>]*class="([^"]*)"/g)].map((m) => m[1]);
    const relatives = details.filter((c) => c.includes('relative'));
    if (relatives.length === 0) return;
    expect(relatives.every((c) => c.includes('max-md:static'))).toBe(true);
  });
});
