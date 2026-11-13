import type { LibModules } from '../types';

// Каталог библиотек SDK (13.11, часть 2в спеки анимаций, reports/animations/spec.md): секция просит библиотеку строкой
// "lib:<имя>" в uses section.json и получает ctx.lib.<имя> — адаптер с правилами SDK (только свои элементы, свойства из
// keyframes.ts, «уменьшить движение» и still-запуск в превью — последний кадр, снятие секции — остановка). Код секции библиотеку не
// импортирует. Сборка кладёт код адаптера только в бандл страниц с такими секциями; приём секции отказывает lib-unknown
// на имени не из каталога. Только данные: каталог читают приём секции, сборка и справка — без кода библиотек.
//
// Новая библиотека: адаптер src/core/behaviors/lib-<имя>.ts, строка каталога, тип в LibModules (types.ts), точная
// версия в package.json пакета. Лицензии — только MIT, ISC и Apache-2.0 (GSAP — нет: лицензия Webflow запрещает его в
// no-code инструментах).

export const LIBRARY_LICENSES = ['MIT', 'ISC', 'Apache-2.0'] as const;
export type LibraryLicense = (typeof LIBRARY_LICENSES)[number];
export type LibraryName = keyof LibModules;

export interface LibrarySpec {
  readonly package: string; // пакет npm
  readonly version: string; // точная версия: та же, что в package.json пакета (тест сверяет)
  readonly license: LibraryLicense;
  readonly budget: number; // предел brotli файла адаптера вместе с его кусками, Б (build/behaviors.ts)
  readonly adapter: string; // файл адаптера в dist/behaviors без .js: lib-<имя>
  readonly title: string; // для справки: что даёт
  readonly api: readonly string[]; // методы ctx.lib.<имя> — для справки
}

export const LIBRARIES: Readonly<Record<LibraryName, LibrarySpec>> = {
  motion: {
    package: 'motion',
    version: '14.8.0',
    license: 'MIT',
    // Спека считала 19 456 Б по Motion 14.0 (полный animate — 18,2 КБ). В 14.8 animate отдаёт класс Timeline: один
    // animate из 'motion' — 23,2 КБ brotli, с адаптером — 24,8 КБ (замер 13.11). Предел — по замеру 14.8.
    budget: 25600,
    adapter: 'lib-motion',
    title: 'Полный Motion: таймлайн по сценарию, анимация чисел, отдельные x и y',
    api: ['timeline', 'tween', 'animate'],
  },
  // 13.11, пункт 7: плавная прокрутка — библиотекой, а не настройкой темы (решение владельца: анимации свободные, автор
  // секции сам включает прокрутку и вешает на неё свои анимации). Экземпляр один на страницу (lib-lenis.ts).
  lenis: {
    package: 'lenis',
    version: '1.3.27',
    license: 'MIT',
    // Lenis 1.3.27 с адаптером и общим счётчиком запрета прокрутки — 5964 Б brotli (замер 13.11).
    budget: 6144,
    adapter: 'lib-lenis',
    title: 'Плавная прокрутка страницы Lenis: подписка на прокрутку, прокрутка к месту, остановка',
    api: ['onScroll', 'scrollTo', 'stop', 'start', 'configure'],
  },
};

export const LIB_USE_PREFIX = 'lib:';
export const LIBRARY_NAMES: readonly LibraryName[] = ['motion', 'lenis'];

export const isLibraryName = (name: string): name is LibraryName => LIBRARY_NAMES.some((item) => item === name);
