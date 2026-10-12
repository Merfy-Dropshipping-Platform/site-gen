import { describe, expect, it } from 'vitest';
import type { Pointer } from '../src/formats';
import { nextPointer } from '../src/pointer';

const KEY = 'storefront/pointers/uzelok.json';
const LIVE: Pointer = {
  v: 1,
  shop: 'uzelok',
  build: 5,
  newest: 5,
  rev: 3,
  paused: false,
  pending: null,
  history: [4, 3],
};

function errorOf(work: () => unknown): unknown {
  try {
    work();
  } catch (error) {
    return error;
  }
  return null;
}

describe('откат выпуска (design.md блока 10, П10-4 А)', () => {
  it('без паузы: живая — сборка из истории, сломанная в историю не попадает', () => {
    const decision = nextPointer(LIVE, { kind: 'revert', from: 5, to: 4, pause: false }, KEY);
    expect(decision.outcome).toBe('live');
    expect(decision.next).toEqual({ ...LIVE, build: 4, history: [3], rev: 4 });
  });

  it('с паузой (выпуск платформы) — на паузе', () => {
    const decision = nextPointer(LIVE, { kind: 'revert', from: 5, to: 3, pause: true }, KEY);
    expect(decision.outcome).toBe('paused');
    expect(decision.next).toMatchObject({ build: 3, history: [4], paused: true });
  });

  it('живая уже другая — ничего не делаем', () => {
    expect(nextPointer(LIVE, { kind: 'revert', from: 6, to: 4, pause: false }, KEY)).toEqual({
      outcome: 'unchanged',
      next: null,
    });
  });

  it('сборки нет в истории — rollback-impossible', () => {
    const error = errorOf(() => nextPointer(LIVE, { kind: 'revert', from: 5, to: 2, pause: false }, KEY));
    expect(error).toMatchObject({ code: 'rollback-impossible' });
  });

  it('после отката старая сборка выпуска не выкладывается снова', () => {
    const reverted = nextPointer(LIVE, { kind: 'revert', from: 5, to: 4, pause: false }, KEY).next;
    expect(nextPointer(reverted, { kind: 'publish', shop: 'uzelok', build: 5 }, KEY).outcome).toBe('stale');
  });
});
