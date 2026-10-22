import { ShellError } from '../errors';
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
]);
const UNSAFE_VALUE = /url\(|["'\\]/i;

const valuesOf = (value: KeyframeValue | readonly KeyframeValue[]): readonly KeyframeValue[] =>
  typeof value === 'object' ? value : [value];

const unsafe = (value: KeyframeValue): boolean => typeof value === 'string' && UNSAFE_VALUE.test(value);

export function checkKeyframes(keyframes: Keyframes): void {
  for (const [name, value] of Object.entries(keyframes)) {
    if (!ANIMATABLE.has(name))
      throw new ShellError('sdk-call-invalid', `ctx.animate: свойство ${name} анимировать нельзя`);
    if (valuesOf(value).some(unsafe))
      throw new ShellError('sdk-call-invalid', `ctx.animate: в значении ${name} нельзя url(…), кавычки и «\\»`);
  }
}
