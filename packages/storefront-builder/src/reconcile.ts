import { buildKey, parseBuildInputs } from '@merfy/storefront-build';
import type { ObjectStore } from '@merfy/storefront-storage';
import { z } from 'zod';
import { acceptIncoming, type AcceptDeps } from './accept';
import { errorText } from './errors';
import { liveKey } from './live';
import { readSnapshot, type SnapshotDeps } from './snapshot';

// Сверка раз в час (design.md блока 6, Св-3 А): событие могло потеряться (издатель товаров глотает ошибку отправки,
// факт 23) — поэтому для каждого опубликованного магазина новой темы ключ сборки по текущим входам сравнивается с
// ключом живой сборки. Не совпал или живой сборки нет — обычное событие сборки reconcile.

const SHOPS_SQL = `SELECT id FROM site WHERE theme_id = ANY($1) AND status = 'published' AND deleted_at IS NULL
  ORDER BY id`;
const idRow = z.object({ id: z.string() });

export interface ReconcileDeps extends AcceptDeps {
  store: ObjectStore;
  snapshot: SnapshotDeps;
  clock: () => Date;
}

async function isStale(deps: ReconcileDeps, siteId: string): Promise<boolean> {
  const snapshot = await readSnapshot(deps.snapshot, siteId);
  const key = buildKey(parseBuildInputs(snapshot.inputs));
  return (await liveKey(deps.store, snapshot.address.label)) !== key;
}

// Один магазин: расхождение — событие; снимок не получен — в журнал, сверка придёт снова через час.
async function reconcileShop(deps: ReconcileDeps, siteId: string): Promise<boolean> {
  try {
    if (!(await isStale(deps, siteId))) return false;
    const event = { owner: 'site', siteId, type: 'reconcile', eventAt: deps.clock().toISOString() } as const;
    await acceptIncoming(deps, event);
    return true;
  } catch (error) {
    deps.log('reconcile-failed', { shopId: siteId, error: errorText(error) });
    return false;
  }
}

// Все магазины по очереди. Возвращает, у скольких нашлось расхождение.
export async function reconcileShops(deps: ReconcileDeps): Promise<number> {
  const shops = (await deps.db.query(SHOPS_SQL, [deps.themeIds])).rows.map((row) => idRow.parse(row).id);
  let stale = 0;
  for (const siteId of shops) stale += Number(await reconcileShop(deps, siteId));
  deps.log('reconcile', { shops: shops.length, stale });
  return stale;
}
