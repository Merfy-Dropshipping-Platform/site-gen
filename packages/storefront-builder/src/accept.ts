import { z } from 'zod';
import { priorityOf, type IncomingEvent } from './events';
import type { Log } from './log';
import { previewSignal, type Preview } from './preview';
import { acceptEvent, type Accepted, type Queryable, type ShopStateOptions, type StartedJob } from './shop-state';

// Приём события (design.md блока 6, В6-3 Б): чьи это магазины → строка каждого → свободен — задание в очередь, занят —
// склейка. Сборщик берёт только магазины новой архитектуры (тема — из theme-versions.json блока 4): нынешние
// магазины пересобирает старый конвейер, как раньше. Событие подтверждается сразу после записи в строку магазина —
// prefetch не держит ждущих.

// Собирать — только опубликованные магазины. Публикация и команда перезапуска — для любого: сама публикация ставит
// статус published уже после события (sites.service.ts, publish).
const BUILDABLE_STATUSES = new Set(['published']);
const ANY_STATUS_EVENTS = new Set(['merchant-publish', 'restart']);

const SITE_SQL = 'SELECT id, status FROM site WHERE id = $1 AND theme_id = ANY($2) AND deleted_at IS NULL';
// tenantId события товара — id организации или id сайта (product-update.listener.ts:207-219).
const TENANT_SQL =
  'SELECT id, status FROM site WHERE (tenant_id = $1 OR id = $1) AND theme_id = ANY($2) AND deleted_at IS NULL';
const shopRow = z.object({ id: z.string(), status: z.string() });

export interface AcceptDeps {
  db: Queryable;
  themeIds: readonly string[];
  shopState: ShopStateOptions;
  log: Log;
  enqueue: (job: StartedJob) => Promise<void>;
  preview?: Preview;
}

async function shopsOf(deps: AcceptDeps, event: IncomingEvent): Promise<string[]> {
  const [sql, owner] = event.owner === 'site' ? [SITE_SQL, event.siteId] : [TENANT_SQL, event.tenantId];
  const shops = (await deps.db.query(sql, [owner, deps.themeIds])).rows.map((row) => shopRow.parse(row));
  const buildable = shops.filter((shop) => BUILDABLE_STATUSES.has(shop.status) || ANY_STATUS_EVENTS.has(event.type));
  return buildable.map((shop) => shop.id);
}

async function acceptForShop(deps: AcceptDeps, event: IncomingEvent, siteId: string): Promise<Accepted> {
  const shopEvent = { siteId, priority: priorityOf(event.type), eventAt: event.eventAt };
  const accepted = await acceptEvent(deps.db, shopEvent, deps.shopState);
  const { outcome, ...fields } = accepted;
  deps.log('event-accepted', { type: event.type, shopId: siteId, outcome, ...fields });
  if (accepted.outcome === 'started') await deps.enqueue(accepted);
  await deps.preview?.(previewSignal(event.type, siteId));
  return accepted;
}

// Событие → строки магазинов. Не наш магазин (нынешняя тема, черновик, удалён) — ничего, в журнале «ignored».
export async function acceptIncoming(deps: AcceptDeps, event: IncomingEvent): Promise<Accepted[]> {
  const shops = await shopsOf(deps, event);
  if (shops.length === 0) deps.log('event-ignored', { type: event.type });
  const results: Accepted[] = [];
  for (const siteId of shops) results.push(await acceptForShop(deps, event, siteId));
  return results;
}
