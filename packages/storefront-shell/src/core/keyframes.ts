import type { KeyframeValue, Keyframes } from './types';

// Граница анимаций кода секции (design.md блока 6, раздел 10; 15 Г — запросы только к шлюзу). С 13.11 (владелец: «я хочу
// чтобы он анимировал все что хотел и как хотел») имя свойства — любое CSS-свойство в camelCase, как у Motion, или
// CSS-переменная --*; защиту держит проверка значения. Правило одно для ctx.animate, extra пресетов и ctx.lib.motion.
// Значение — число или строка без частей ниже: каждая дала бы запрос к чужому адресу или выход из значения.
export const FORBIDDEN_IN_VALUE: readonly (readonly [string, string])[] = [
  ['url(', 'картинка, маска или фильтр SVG с чужого адреса'],
  ['image-set(', 'набор картинок с адресами'],
  ['-webkit-image-set(', 'то же с префиксом'],
  ['cross-fade(', 'смесь картинок с адресами'],
  ['element(', 'снимок чужого элемента страницы'],
  ['src(', 'адрес, как url('],
  ['"', 'строка в кавычках — адрес в image-set("…")'],
  ["'", 'то же в одинарных кавычках'],
  ['\\', 'экранирование: \\75 rl( — это url('],
  [';', 'конец значения и начало чужого свойства'],
  ['{', 'блок правил CSS'],
  ['}', 'конец блока правил'],
  ['@', 'правило @import и подобные'],
];

// camelCase без дефисов (backgroundColor, WebkitMaskPosition) или переменная --имя.
const PROPERTY_NAME = /^(?:[a-zA-Z][a-zA-Z0-9]*|--[a-zA-Z0-9_-]+)$/;
// Те же части одной проверкой (image-set( покрывает и -webkit-image-set(); тест сверяет её со списком выше.
const UNSAFE_VALUE = /url\(|image-set\(|cross-fade\(|element\(|src\(|["'\\;{}@]/i;

const valuesOf = (value: KeyframeValue | readonly KeyframeValue[]): readonly KeyframeValue[] =>
  typeof value === 'object' ? value : [value];

const unsafe = (value: KeyframeValue): boolean => typeof value === 'string' && UNSAFE_VALUE.test(value);

// Проверку зовёт провайдер ctx.animate (файл animate.js), поэтому ошибка — обычный Error с полем code, а не ShellError:
// класс ShellError стал бы отдельным куском, общим с другими поведениями, и утяжелил бы их (12.11, бюджеты brotli).
const invalid = (text: string): Error => Object.assign(new Error(text), { code: 'sdk-call-invalid' });

export function checkKeyframes(keyframes: Keyframes): void {
  for (const [name, value] of Object.entries(keyframes)) {
    if (!PROPERTY_NAME.test(name))
      throw invalid(`ctx.animate: ${name} — не свойство CSS в camelCase и не --переменная`);
    if (valuesOf(value).some(unsafe))
      throw invalid(
        `ctx.animate: в значении ${name} нельзя url(, image-set(, cross-fade(, element(, src(, кавычки, \\ ; { } @`,
      );
  }
}
