import { recordPath, recordSlug } from '@merfy/storefront-build';
import { z } from 'zod';
import { parseWith } from './parse';

// События «в магазине что-то поменялось» и задания сборки (design.md блока 6, Св-3 А, В6-2). Сборщик слушает две
// точки обмена RabbitMQ:
//   content.events — события из site-gen: { v: 1, type, siteId, eventAt, source }; type — id события блока 3
//                    (rebuild-events.json) или служебное: old-path — старый путь сборки отдал магазин сборщику,
//                    reconcile — сверка нашла расхождение, restart — служебная команда перезапуска; у публикации —
//                    адрес ответа (replyTo, correlationId): сборщик отвечает номером сборки (buildReplyBody);
//   product.events — готовые события сервиса product: { event, tenantId, productIds, timestamp }; tenantId — id
//                    организации или id сайта (product-update.listener.ts:207-219).
// Задание сборки в очереди storefront_builds — { v: 1, siteId, build }: всё остальное лежит в строке магазина.

export const CONTENT_EXCHANGE = 'content.events';
export const PRODUCT_EXCHANGE = 'product.events';
const FORMAT_VERSION = 1;
const EVENT_TYPE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PRODUCT_CHANGE = 'product-change';

// Приоритет задания: публикация › правка › выпуск темы (архитектура этапа, В-3 А). RabbitMQ советует 2–4 уровня.
export const PRIORITY = { publish: 3, edit: 2, release: 1 } as const;
export const MAX_PRIORITY = PRIORITY.publish;
const PRIORITY_OF_EVENT: Readonly<Record<string, number>> = {
  'merchant-publish': PRIORITY.publish,
  'theme-release': PRIORITY.release,
  'platform-release': PRIORITY.release,
  'extension-release': PRIORITY.release,
};

export const priorityOf = (type: string): number => PRIORITY_OF_EVENT[type] ?? PRIORITY.edit;

// Событие, приведённое к одному виду: чьё оно — сайта или организации — и когда была правка.
export type IncomingEvent =
  | { owner: 'site'; siteId: string; type: string; eventAt: string }
  | { owner: 'tenant'; tenantId: string; type: string; eventAt: string; paths?: EntityPathsChange };

// Адреса страниц товара, которые событие дописывает в список адресов магазина и убирает из него (блок 8 «Секций и
// SDK», часть 8б-2, Р8б-16): по списку раздача до следующей сборки отправляет адрес на рендер по запросу.
export interface EntityPathsChange {
  add: string[];
  remove: string[];
}

const instant = z.iso.datetime({ offset: true });

const contentEventSchema = z.strictObject({
  v: z.literal(FORMAT_VERSION),
  type: z.string().regex(EVENT_TYPE),
  siteId: z.string().min(1),
  eventAt: instant,
  source: z.string().min(1),
});

// Сообщения product.events пишет другой сервис: лишние поля не ошибка, время правки — если есть.
const productEventSchema = z.object({
  event: z.string().min(1),
  tenantId: z.string().min(1),
  timestamp: instant.optional(),
  // Блок 8 «Секций и SDK», часть 8б-2: не по форме — как будто поля нет; событие всё равно принято.
  productIds: z.array(z.string().min(1)).optional().catch(undefined),
  handle: z.string().optional().catch(undefined),
});
type ProductEventBody = z.infer<typeof productEventSchema>;

export interface ContentEvent {
  type: string;
  siteId: string;
  eventAt: string;
  source: string;
}

function contentEvent(body: unknown): IncomingEvent {
  const event = parseWith(contentEventSchema, body, 'message-invalid', CONTENT_EXCHANGE);
  return { owner: 'site', siteId: event.siteId, type: event.type, eventAt: event.eventAt };
}

// Адреса из события кабинета: создан — адрес товара; удалён — адрес и адрес по id. Без handle (импорт, правка) или не
// про один товар — null.
function entityPathsOf(event: ProductEventBody): EntityPathsChange | null {
  const [productId, ...others] = event.productIds ?? [];
  if (productId === undefined || others.length > 0 || event.handle === undefined) return null;
  const path = recordPath.product(recordSlug(event.handle, productId));
  if (event.event === 'product.created') return { add: [path], remove: [] };
  if (event.event !== 'product.deleted') return null;
  return { add: [], remove: [...new Set([path, recordPath.product(productId)])] };
}

function productEvent(body: unknown, receivedAt: string): IncomingEvent {
  const event = parseWith(productEventSchema, body, 'message-invalid', PRODUCT_EXCHANGE);
  const accepted = {
    owner: 'tenant' as const,
    tenantId: event.tenantId,
    type: PRODUCT_CHANGE,
    eventAt: event.timestamp ?? receivedAt,
  };
  const paths = entityPathsOf(event);
  return paths === null ? accepted : { ...accepted, paths };
}

const PARSERS: Readonly<Record<string, (body: unknown, receivedAt: string) => IncomingEvent>> = {
  [CONTENT_EXCHANGE]: contentEvent,
  [PRODUCT_EXCHANGE]: productEvent,
};

// Сообщение из очереди событий → событие. Точку обмена называет сам брокер (fields.exchange).
export function parseIncoming(exchange: string, body: unknown, receivedAt: string): IncomingEvent {
  const parse = PARSERS[exchange] ?? contentEvent;
  return parse(body, receivedAt);
}

export const contentEventBody = (event: ContentEvent) => ({ v: FORMAT_VERSION, ...event });

// Ответ на событие с адресом ответа — публикацию из site-gen (StorefrontHandoff.requestBuild): номер сборки, в которую
// вошло событие, или null — магазин не новой темы, удалён или ждёт места выпуска.
export const buildReplyBody = (build: number | null) => ({ v: FORMAT_VERSION, build });

const jobSchema = z.strictObject({
  v: z.literal(FORMAT_VERSION),
  siteId: z.string().min(1),
  build: z.int().positive(),
});

export interface BuildJob {
  siteId: string;
  build: number;
}

export const jobBody = (job: BuildJob) => ({ v: FORMAT_VERSION, ...job });

export function parseJob(body: unknown): BuildJob {
  const job = parseWith(jobSchema, body, 'message-invalid', 'storefront_builds');
  return { siteId: job.siteId, build: job.build };
}
