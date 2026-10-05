import { describe, expect, it } from 'vitest';
import { fluid, lengthCss, rem, round4, shadowCss } from '../src/lengths';

describe('размеры', () => {
  it('пиксели печатаются в rem, ноль — без единиц', () => {
    expect(rem(8)).toBe('0.5rem');
    expect(rem(1280)).toBe('80rem');
    expect(rem(120)).toBe('7.5rem');
    expect(rem(0)).toBe('0');
    expect(round4(1 / 3)).toBe('0.3333');
  });

  it('плавный размер — clamp() для экрана от 360 до 1280 px', () => {
    expect(fluid(24, 32)).toBe('clamp(1.5rem, 1.3043rem + 0.8696vw, 2rem)');
    expect(fluid(48, 96)).toBe('clamp(3rem, 1.8261rem + 5.2174vw, 6rem)');
  });

  it('min = max печатается обычным числом', () => {
    expect(fluid(12, 12)).toBe('0.75rem');
    expect(lengthCss({ min: 16, max: 16 })).toBe('1rem');
    expect(lengthCss(12)).toBe('0.75rem');
  });
});

describe('тень', () => {
  it('чёрная по умолчанию, прозрачность — в цвете', () => {
    expect(shadowCss({ x: 0, y: 8, blur: 24, spread: 0, opacity: 0.12 }, {})).toBe('0 0.5rem 1.5rem 0 #0000001f');
    expect(shadowCss({ x: 0, y: 0, blur: 32, spread: 0, opacity: 0.16 }, {})).toBe('0 0 2rem 0 #00000029');
  });

  it('прозрачность 0 — none', () => {
    expect(shadowCss({ x: 0, y: 0, blur: 0, spread: 0, opacity: 0 }, {})).toBe('none');
  });

  it('берёт цвет из словаря — свой в каждой схеме', () => {
    const glow = { x: 0, y: 0, blur: 24, spread: 0, opacity: 0.35, color: 'theme-gold' };
    expect(shadowCss(glow, { 'theme-gold': '#c9a227' })).toBe('0 0 1.5rem 0 #c9a22759');
    expect(shadowCss(glow, { 'theme-gold': '#e0b93a' })).toBe('0 0 1.5rem 0 #e0b93a59');
  });
});
