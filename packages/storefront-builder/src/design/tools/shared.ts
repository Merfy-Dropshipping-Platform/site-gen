import type { PartFont } from '../design-style';
import type { Align, ButtonLook, CardLook, TypeRole } from '../design-types';
import { categoryOf, familyOf, sourceOf, weight } from '../design-values';

// Общие переводы слов инструментов в слова формата. У инструментов свои слова: fill/panel у нашего скрипта,
// variant у designlang; формат — filled/outline/text и flat/raised.

export const BUTTON_WORDS: Record<string, ButtonLook> = {
  fill: 'filled',
  filled: 'filled',
  outline: 'outline',
  text: 'text',
};
export const CARD_WORDS: Record<string, CardLook> = { flat: 'flat', panel: 'raised', raised: 'raised' };
export const ALIGN_WORDS: Record<string, Align> = {
  left: 'left',
  center: 'center',
  right: 'right',
  start: 'left',
  end: 'right',
};
export const TYPE_WORDS: Record<string, TypeRole> = {
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  text: 'body',
  body: 'body',
  small: 'small',
  'heading-1': 'h1',
  'heading-2': 'h2',
  'heading-3': 'h3',
  caption: 'small',
};

export function partFont(
  stack: string,
  rawWeight: unknown,
  cyrillic: boolean | null,
  google: ReadonlySet<string>,
): PartFont | null {
  const family = familyOf(stack);
  if (family === null) return null;
  return { family, category: categoryOf(stack), weight: weight(rawWeight), cyrillic, source: sourceOf(family, google) };
}

// Уверенность по числу найденного: одна кнопка — догадка, три и больше — правило сайта.
export const byCount = (count: number, enough: number): number => (count >= enough ? 0.8 : 0.4);
