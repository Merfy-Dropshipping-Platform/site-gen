import { readPointer, type ObjectStore, type Pointer } from '@merfy/storefront-storage';
import { z } from 'zod';
import type { DrawAnswer } from './draw';
import { StorefrontBuilderError, errorText } from './errors';
import type { Log } from './log';
import type { Queryable } from './shop-state';
import { readShop, shopAddress, type Shop } from './snapshot';
import { jsonAnswer } from './stand-preview';

// Указатель магазина для sites (статус сборки в site-gen, `GET /sites/:id/builds/:buildId/status`): итог «paused» в
// строке сборки записан при её конце и потом не меняется, а паузу снимают (resume) — ждущая сборка становится живой.
// Чтобы честно сказать, что с сборкой сейчас, sites спрашивает здесь, что в указателе. Только чтение, данные — заново
// на каждый запрос; раскладку путей знает пакет хранилища, не sites.

export const POINTER_ROUTE = '/pointer';

export interface PointerState {
  build: number;
  paused: boolean;
  pending: number | null;
}

export interface PointerStateDeps {
  shop: (shopId: string) => Promise<Pick<Shop, 'id' | 'publicUrl'> | null>;
  pointer: (label: string) => Promise<Pick<Pointer, 'build' | 'paused' | 'pending'> | null>;
  log: Log;
}

export const pointerStateDeps = (db: Queryable, store: ObjectStore, log: Log): PointerStateDeps => ({
  shop: (shopId) => readShop(db, shopId),
  pointer: (label) => readPointer(store, label),
  log,
});

const TEXT = {
  shop: 'не магазин',
  missing: 'магазин не найден',
  pointer: 'у магазина нет указателя',
  failed: 'указатель не прочитан',
} as const;

// Метка хоста — та же, по какой сборщик пишет указатель (shopAddress). Нет магазина, адреса или указателя — 404.
async function stateOf(deps: PointerStateDeps, shopId: string): Promise<DrawAnswer> {
  const shop = await deps.shop(shopId);
  if (shop === null) return jsonAnswer(404, { problems: [TEXT.missing] });
  const pointer = await deps.pointer(shopAddress(shop).label);
  if (pointer === null) return jsonAnswer(404, { problems: [TEXT.pointer] });
  const state: PointerState = { build: pointer.build, paused: pointer.paused, pending: pointer.pending };
  return jsonAnswer(200, state);
}

// GET /pointer?shop=<uuid>: { build, paused, pending }. Сбой хранилища или базы — 500 и строка журнала.
export async function pointerState(deps: PointerStateDeps, rawShop: string | null): Promise<DrawAnswer> {
  const shop = z.uuid().safeParse(rawShop);
  if (!shop.success) return jsonAnswer(400, { problems: [TEXT.shop] });
  try {
    return await stateOf(deps, shop.data);
  } catch (error) {
    // Нет адреса у магазина (shopAddress) — указателя у него быть не может.
    if (error instanceof StorefrontBuilderError && error.code === 'shop-invalid')
      return jsonAnswer(404, { problems: [TEXT.pointer] });
    deps.log('pointer-failed', { shopId: shop.data, error: errorText(error) });
    return jsonAnswer(500, { problems: [TEXT.failed] });
  }
}
