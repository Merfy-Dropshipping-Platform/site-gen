import { BLACK } from './color';
import type { FluidValue, ShadowValue, TokenSet } from './types';

// Размеры в теме — пиксели; в CSS — rem, чтобы размер шёл за настройкой шрифта в браузере (design.md, раздел 3).
const ROOT_PX = 16;
// Плавный размер {min, max} растёт от ширины экрана 360 px до 1280 px.
const VIEWPORT = { min: 360, max: 1280 };
const PRECISION = 10_000;
const VW_PERCENT = 100;
const MAX_ALPHA = 255;

// Округление до 4 знаков: одинаковые входы дают одинаковый CSS до байта.
export const round4 = (value: number): string => String(Math.round(value * PRECISION) / PRECISION);

export const rem = (px: number): string => (px === 0 ? '0' : `${round4(px / ROOT_PX)}rem`);

export function fluid(min: number, max: number): string {
  if (min === max) return rem(min);
  const slope = (max - min) / (VIEWPORT.max - VIEWPORT.min);
  const intercept = min - slope * VIEWPORT.min;
  return `clamp(${rem(min)}, ${rem(intercept)} + ${round4(slope * VW_PERCENT)}vw, ${rem(max)})`;
}

export const lengthCss = (value: number | FluidValue): string =>
  typeof value === 'number' ? rem(value) : fluid(value.min, value.max);

const alphaHex = (opacity: number): string =>
  Math.round(opacity * MAX_ALPHA)
    .toString(16)
    .padStart(2, '0');

// Цвет тени — из словаря (свой в каждой схеме) или чёрный: светлая «тень» на тёмной схеме читается как свечение.
function shadowColor(value: ShadowValue, colors: Readonly<TokenSet>): string {
  const named = value.color === undefined ? undefined : colors[value.color];
  return typeof named === 'string' ? named : BLACK;
}

export function shadowCss(value: ShadowValue, colors: Readonly<TokenSet>): string {
  if (value.opacity === 0) return 'none';
  const offsets = [value.x, value.y, value.blur, value.spread].map((px) => rem(px));
  return `${offsets.join(' ')} ${shadowColor(value, colors)}${alphaHex(value.opacity)}`;
}
