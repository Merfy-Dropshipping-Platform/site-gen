import type { KeyframeValue, Keyframes } from './types';

// Граница ctx.animate (design.md блока 6, раздел 10; 15 Г — запросы только к шлюзу). Код секции анимирует только
// свойства из списка; значение — число или строка без url(), кавычек и «\», как у cssVar в attributes.ts: url() дал бы
// запрос к чужому адресу, кавычки — адрес в image-set("…"), «\» — url через экранирование. Имена — как у Motion: camelCase.
export const ANIMATABLE: ReadonlySet<string> = new Set([
  'opacity',
  'transform',
  'translate',
  'scale',
  'rotate',
  'color',
  'backgroundColor',
  'borderColor',
  'width',
  'height',
  'maxHeight',
  // 12.11: маски, размытие, прорисовка линий SVG (pathLength="1"), межбуквенный интервал, скругление, фон.
  'clipPath',
  'filter',
  'strokeDashoffset',
  'strokeDasharray',
  'letterSpacing',
  'borderRadius',
  'backgroundPosition',
]);
const UNSAFE_VALUE = /url\(|["'\\]/i;
// filter — только эти функции с числом и единицей внутри: drop-shadow() и url() тянут чужие цвета и адреса.
const FILTER_VALUE = /^\s*(?:none|(?:(?:blur|brightness|contrast|saturate|grayscale|opacity)\([-\d.a-z%\s]*\)\s*)+)$/i;

const valuesOf = (value: KeyframeValue | readonly KeyframeValue[]): readonly KeyframeValue[] =>
  typeof value === 'object' ? value : [value];

const unsafe = (value: KeyframeValue): boolean => typeof value === 'string' && UNSAFE_VALUE.test(value);

// Проверку зовёт провайдер ctx.animate (файл animate.js), поэтому ошибка — обычный Error с полем code, а не ShellError:
// класс ShellError стал бы отдельным куском, общим с другими поведениями, и утяжелил бы их (12.11, бюджеты brotli).
const invalid = (text: string): Error => Object.assign(new Error(text), { code: 'sdk-call-invalid' });

export function checkKeyframes(keyframes: Keyframes): void {
  for (const [name, value] of Object.entries(keyframes)) {
    if (!ANIMATABLE.has(name)) throw invalid(`ctx.animate: свойство ${name} анимировать нельзя`);
    if (valuesOf(value).some(unsafe)) throw invalid(`ctx.animate: в значении ${name} нельзя url(…), кавычки и «\\»`);
    if (name === 'filter' && !valuesOf(value).every((item) => typeof item === 'string' && FILTER_VALUE.test(item)))
      throw invalid('ctx.animate: filter — blur, brightness, contrast, saturate, grayscale, opacity');
  }
}
