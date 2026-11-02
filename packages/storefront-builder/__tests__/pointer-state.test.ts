import { describe, expect, it, vi } from 'vitest';
import { StorefrontBuilderError } from '../src/errors';
import { POINTER_ROUTE, pointerState, type PointerStateDeps } from '../src/pointer-state';

// GET /pointer?shop=: что в указателе магазина — для статуса сборки в sites (итог «paused» в строке сборки потом не
// меняется, а паузу снимают). Хранилище и база подменены: раскладку путей знает пакет хранилища.
const SHOP = '3a9626f7-390d-4a66-bca5-a3b806ca6c1b';

function depsOf(patch: Partial<PointerStateDeps> = {}) {
  const pointer = vi.fn(() => Promise.resolve({ build: 1793577003490, paused: false, pending: null }));
  const log = vi.fn();
  const deps: PointerStateDeps = {
    shop: (id) => Promise.resolve({ id, publicUrl: 'https://nova-shop.dev.merfy.ru' }),
    pointer,
    log,
    ...patch,
  };
  return { deps, pointer, log };
}

const jsonOf = (body: string): unknown => JSON.parse(body);

describe('pointerState', () => {
  it('адрес маршрута', () => {
    expect(POINTER_ROUTE).toBe('/pointer');
  });

  it('отдаёт build, paused и pending; указатель ищется по метке хоста магазина', async () => {
    const { deps } = depsOf({
      pointer: vi.fn(() => Promise.resolve({ build: 5, paused: true, pending: 7 })),
    });

    const answer = await pointerState(deps, SHOP);

    expect(answer.status).toBe(200);
    expect(jsonOf(answer.body)).toEqual({ build: 5, paused: true, pending: 7 });
    expect(answer.headers?.['Cache-Control']).toBe('no-store');
    expect(deps.pointer).toHaveBeenCalledWith('nova-shop');
  });

  it('магазин без паузы: pending пуст', async () => {
    const { deps } = depsOf();

    const answer = await pointerState(deps, SHOP);

    expect(jsonOf(answer.body)).toEqual({ build: 1793577003490, paused: false, pending: null });
  });

  it('id не uuid — 400, ни база, ни хранилище не читаются', async () => {
    const { deps, pointer } = depsOf({ shop: vi.fn(() => Promise.resolve(null)) });

    for (const raw of [null, '', 'abc', "x' OR 1=1"]) expect((await pointerState(deps, raw)).status).toBe(400);
    expect(deps.shop).not.toHaveBeenCalled();
    expect(pointer).not.toHaveBeenCalled();
  });

  it('магазина нет — 404', async () => {
    const { deps, pointer } = depsOf({ shop: () => Promise.resolve(null) });

    expect((await pointerState(deps, SHOP)).status).toBe(404);
    expect(pointer).not.toHaveBeenCalled();
  });

  it('у магазина нет адреса — 404, не 500', async () => {
    const { deps, pointer } = depsOf({ shop: (id) => Promise.resolve({ id, publicUrl: null }) });

    expect((await pointerState(deps, SHOP)).status).toBe(404);
    expect(pointer).not.toHaveBeenCalled();
  });

  it('указателя нет — 404', async () => {
    const { deps } = depsOf({ pointer: () => Promise.resolve(null) });

    expect((await pointerState(deps, SHOP)).status).toBe(404);
  });

  it('хранилище упало — 500 и строка журнала с магазином', async () => {
    const failure = new StorefrontBuilderError('rpc-failed', 'хранилище не ответило');
    const { deps, log } = depsOf({
      pointer: () => Promise.reject(failure),
    });

    const answer = await pointerState(deps, SHOP);

    expect(answer.status).toBe(500);
    expect(log).toHaveBeenCalledWith('pointer-failed', { shopId: SHOP, error: failure.message });
  });
});
