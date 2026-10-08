import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, type Pointer } from '../src/formats';
import { changePointer, hasLiveBuild, nextPointer, readPointer } from '../src/pointer';
import { createMemoryStore } from './memory-store';
import { SHOP } from './manifests';
import { rejected, thrown } from './support';

const KEY = 'storefront/pointers/scarf.json';
const LIVE: Pointer = {
  v: 1,
  shop: SHOP,
  build: 41,
  newest: 41,
  rev: 7,
  paused: false,
  pending: null,
  history: [40, 39],
};
const publish = (build: number) => ({ kind: 'publish', shop: SHOP, build }) as const;

describe('выкладка', () => {
  it('первая — создаёт указатель: живая сборка, rev 1, истории нет', () => {
    expect(nextPointer(null, publish(1), KEY)).toEqual({
      outcome: 'live',
      next: { v: 1, shop: SHOP, build: 1, newest: 1, rev: 1, paused: false, pending: null, history: [] },
    });
  });

  it('новая сборка — живая, прошлая уходит в историю, rev растёт', () => {
    expect(nextPointer(LIVE, publish(42), KEY)).toEqual({
      outcome: 'live',
      next: { ...LIVE, build: 42, newest: 42, rev: 8, history: [41, 40, 39] },
    });
  });

  it('только если новее: сборка не новее newest — stale, без записи', () => {
    expect(nextPointer(LIVE, publish(40), KEY)).toEqual({ outcome: 'stale', next: null });
    expect(nextPointer({ ...LIVE, build: 40, newest: 41 }, publish(41), KEY)).toEqual({ outcome: 'stale', next: null });
  });

  it('та же сборка ещё раз — уже живая, без записи', () => {
    expect(nextPointer(LIVE, publish(41), KEY)).toEqual({ outcome: 'live', next: null });
  });

  it(`история — не длиннее ${HISTORY_LIMIT}`, () => {
    const full = { ...LIVE, history: Array.from({ length: HISTORY_LIMIT }, (_, index) => 40 - index) };
    expect(nextPointer(full, publish(42), KEY).next?.history).toHaveLength(HISTORY_LIMIT);
  });

  it('указатель другого магазина — object-invalid', () => {
    const other = { ...LIVE, shop: '00000000-0000-4000-8000-000000000002' };
    expect(thrown(() => nextPointer(other, publish(42), KEY))).toMatchObject({ code: 'object-invalid', path: KEY });
  });
});

describe('откат и пауза', () => {
  it('откат: прошлая сборка живая, выкладка на паузе, newest прежний', () => {
    expect(nextPointer(LIVE, { kind: 'rollback', from: 41 }, KEY)).toEqual({
      outcome: 'paused',
      next: { ...LIVE, build: 40, rev: 8, paused: true, history: [39] },
    });
  });

  it('живая уже не та, с которой откатывают, — unchanged, без записи', () => {
    expect(nextPointer(LIVE, { kind: 'rollback', from: 42 }, KEY)).toEqual({ outcome: 'unchanged', next: null });
  });

  it('откатывать некуда — rollback-impossible; указателя нет — pointer-missing', () => {
    const lonely = { ...LIVE, history: [] };
    expect(thrown(() => nextPointer(lonely, { kind: 'rollback', from: 41 }, KEY))).toMatchObject({
      code: 'rollback-impossible',
    });
    expect(thrown(() => nextPointer(null, { kind: 'pause' }, KEY))).toMatchObject({
      code: 'pointer-missing',
      path: KEY,
    });
  });

  it('на паузе новая сборка ждёт: pending и newest растут, живая та же', () => {
    const paused = { ...LIVE, build: 40, paused: true, history: [39] };
    expect(nextPointer(paused, publish(42), KEY)).toEqual({
      outcome: 'paused',
      next: { ...paused, newest: 42, pending: 42, rev: 8 },
    });
    expect(nextPointer({ ...paused, pending: 42, newest: 42 }, publish(42), KEY)).toEqual({
      outcome: 'paused',
      next: null,
    });
  });

  it('после отката застрявшая сборка не выкладывается — stale', () => {
    const paused = { ...LIVE, build: 40, paused: true, history: [39] };
    expect(nextPointer(paused, publish(41), KEY)).toEqual({ outcome: 'stale', next: null });
  });

  it('снятие паузы выкладывает ждущую сборку', () => {
    const waiting = { ...LIVE, build: 40, newest: 42, pending: 42, paused: true, history: [39] };
    expect(nextPointer(waiting, { kind: 'resume' }, KEY)).toEqual({
      outcome: 'live',
      next: { ...waiting, build: 42, pending: null, paused: false, rev: 8, history: [40, 39] },
    });
  });

  it('снятие паузы без ждущей — живая та же', () => {
    const paused = { ...LIVE, paused: true };
    expect(nextPointer(paused, { kind: 'resume' }, KEY)).toEqual({ outcome: 'live', next: { ...LIVE, rev: 8 } });
  });

  it('пауза на паузе и снятие без паузы — без записи', () => {
    expect(nextPointer({ ...LIVE, paused: true }, { kind: 'pause' }, KEY)).toEqual({ outcome: 'paused', next: null });
    expect(nextPointer(LIVE, { kind: 'resume' }, KEY)).toEqual({ outcome: 'live', next: null });
    expect(nextPointer(LIVE, { kind: 'pause' }, KEY)).toEqual({
      outcome: 'paused',
      next: { ...LIVE, paused: true, rev: 8 },
    });
  });
});

describe('указатель в хранилище', () => {
  it('каждая команда — одна запись указателя', async () => {
    const store = createMemoryStore();
    expect(await hasLiveBuild(store, 'scarf')).toBe(false);
    await changePointer(store, 'scarf', publish(1));
    await changePointer(store, 'scarf', publish(2));
    const rolledBack = await changePointer(store, 'scarf', { kind: 'rollback', from: 2 });
    expect(rolledBack).toMatchObject({ outcome: 'paused', pointer: { build: 1, paused: true, newest: 2 } });
    expect(await changePointer(store, 'scarf', publish(3))).toMatchObject({
      outcome: 'paused',
      pointer: { pending: 3 },
    });
    expect(await changePointer(store, 'scarf', { kind: 'resume' })).toMatchObject({ outcome: 'live' });
    expect(await readPointer(store, 'scarf')).toMatchObject({ build: 3, history: [1], rev: 5 });
    expect(store.writes).toEqual(Array.from({ length: 5 }, () => KEY));
    expect(await hasLiveBuild(store, 'scarf')).toBe(true);
  });

  it('служебная команда без указателя — pointer-missing', async () => {
    expect(await rejected(() => changePointer(createMemoryStore(), 'scarf', { kind: 'resume' }))).toMatchObject({
      code: 'pointer-missing',
      path: KEY,
    });
  });
});
