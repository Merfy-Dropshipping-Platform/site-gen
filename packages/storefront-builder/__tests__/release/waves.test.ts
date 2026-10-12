import { describe, expect, it } from 'vitest';
import { cutsOf, planWaves, shuffled } from '../../src/release/waves';

const SHOPS = Array.from({ length: 12 }, (_, index) => `shop-${String(index).padStart(2, '0')}`);
const sizes = (plan: ReturnType<typeof planWaves>): number[] =>
  [0, 1, 2, 3].map((wave) => plan.filter((shop) => shop.wave === wave).length);

describe('волны выпуска (design.md блока 10, «Волны»)', () => {
  it('12 магазинов и тестовый: 1 → 1 → 5 → 6', () => {
    expect(sizes(planWaves([...SHOPS, 'test'], 'test', 7))).toEqual([1, 1, 5, 6]);
  });

  it('границы: в волне не меньше одного, пока магазины есть', () => {
    expect(cutsOf(12)).toEqual([1, 6, 12]);
    expect(cutsOf(4)).toEqual([1, 2, 4]);
    expect(cutsOf(2)).toEqual([1, 2, 2]);
    expect(cutsOf(0)).toEqual([0, 0, 0]);
  });

  it('тот же номер выпуска — тот же порядок; другой — другой', () => {
    expect(planWaves(SHOPS, null, 7)).toEqual(planWaves([...SHOPS].reverse(), null, 7));
    expect(shuffled(SHOPS, 7)).not.toEqual(shuffled(SHOPS, 8));
  });

  it('тестовый магазин — волна 0; нет его в списке — волны 0 нет; повторы убраны', () => {
    expect(planWaves(['a', 'b', 'test'], 'test', 1)[0]).toEqual({ siteId: 'test', wave: 0, position: 0 });
    expect(planWaves(['a', 'b'], 'test', 1).some((shop) => shop.wave === 0)).toBe(false);
    expect(planWaves(['a', 'a', 'b'], null, 1)).toHaveLength(2);
  });

  it('магазинов нет — плана нет', () => {
    expect(planWaves([], null, 1)).toEqual([]);
  });
});
