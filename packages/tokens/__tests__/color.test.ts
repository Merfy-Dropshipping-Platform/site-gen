import { describe, expect, it } from 'vitest';
import { BLACK, READABLE, WHITE, channelsOf, contrastRatio, luminance, mixHex, toHex } from '../src/color';

describe('цвет', () => {
  it('разбирает и собирает #rrggbb', () => {
    expect(channelsOf('#e91e8c')).toEqual([233, 30, 140]);
    expect(toHex([233, 30, 140])).toBe('#e91e8c');
    expect(toHex([0.4, 254.6, 16])).toBe('#00ff10');
  });

  it('смешивает: 12 % текста в фоне — цвет рамки образца', () => {
    expect(mixHex('#111111', '#ffffff', 0.12)).toBe('#e2e2e2');
    expect(mixHex('#f5f5f5', '#111111', 0.12)).toBe('#2c2c2c');
    expect(mixHex('#111111', '#ffffff', 0.6)).toBe('#707070');
  });

  it('считает яркость по WCAG', () => {
    expect(luminance(WHITE)).toBe(1);
    expect(luminance(BLACK)).toBe(0);
  });

  it('считает контраст: на #dc2626 белый 4,83, чёрный 4,35', () => {
    expect(contrastRatio(WHITE, '#dc2626').toFixed(2)).toBe('4.83');
    expect(contrastRatio(BLACK, '#dc2626').toFixed(2)).toBe('4.35');
    expect(contrastRatio('#dc2626', WHITE)).toBe(contrastRatio(WHITE, '#dc2626'));
    expect(contrastRatio(WHITE, BLACK)).toBe(21);
  });

  it('порог читаемости — 4,5', () => {
    expect(READABLE).toBe(4.5);
  });
});
