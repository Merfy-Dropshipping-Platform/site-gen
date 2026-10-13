import type { Entity } from '@merfy/storefront-build';
import { isCounterNumber, type CounterKind } from '@merfy/storefront-config';
import { z } from 'zod';
import { StorefrontBuilderError, errorText } from './errors';
import type { Log } from './log';
import type { Call } from './rpc';

// Счётчики мерчанта магазина (design.md блока 11, С11-4 Б): берём у сборщика аналитики тем же RPC, что кабинет через
// шлюз (analytics.pixels.list, очередь analytics_queue), и кладём в снимок сущностями counter. В новую тему идут только
// включённые счётчики трёх видов с номером по правилу вида (блок 3); «свой код», Meta и номер не по правилу — мимо, со
// строкой журнала без номера и кода. Сервис не ответил или ответил неуспехом — null: снимок «не получен», сборки нет
// (как с товарами, snapshot.ts).
export const ANALYTICS_QUEUE = 'analytics_queue';
const PIXELS_LIST = 'analytics.pixels.list';
// Список не отдаёт дату правки: дата одна на все счётчики, ключ сборки меняет правка самих данных.
export const COUNTER_UPDATED_AT = '1970-01-01T00:00:00.000Z';

// Вид счётчика у сборщика аналитики (config.tracking_pixels.pixel_type) → вид в конфиге витрины.
const KIND_OF_PIXEL: Readonly<Record<string, CounterKind>> = {
  yandex_metrika: 'metrika',
  vk: 'vk',
  google_analytics: 'google',
};

const pixelSchema = z.object({
  id: z.string().min(1),
  pixel_type: z.string(),
  pixel_id: z.string(),
  is_active: z.boolean(),
});
const answerSchema = z.object({
  success: z.boolean(),
  data: z.object({ pixels: z.array(pixelSchema) }).optional(),
});

type Pixel = z.infer<typeof pixelSchema>;

export interface CounterRequest {
  call: Call;
  timeoutMs: number;
  log: Log;
}

export interface CounterShop {
  id: string;
  tenantId: string;
}

const kindOf = (pixelType: string): CounterKind | undefined =>
  Object.hasOwn(KIND_OF_PIXEL, pixelType) ? KIND_OF_PIXEL[pixelType] : undefined;

function counterEntity(request: CounterRequest, shop: CounterShop, pixel: Pixel): Entity[] {
  if (!pixel.is_active) return [];
  const kind = kindOf(pixel.pixel_type);
  const number = pixel.pixel_id.trim();
  if (kind !== undefined && isCounterNumber(kind, number))
    return [{ type: 'counter', id: pixel.id, updatedAt: COUNTER_UPDATED_AT, data: { kind, number } }];
  request.log('counter-skipped', { shopId: shop.id, counterId: pixel.id, type: pixel.pixel_type });
  return [];
}

export async function fetchCounters(request: CounterRequest, shop: CounterShop): Promise<Entity[] | null> {
  const data = { shopId: shop.id, tenantId: shop.tenantId };
  try {
    const answer = answerSchema.parse(await request.call(ANALYTICS_QUEUE, PIXELS_LIST, data, request.timeoutMs));
    if (!answer.success || answer.data === undefined)
      throw new StorefrontBuilderError('rpc-failed', `${PIXELS_LIST}: success = false`);
    return answer.data.pixels.flatMap((pixel) => counterEntity(request, shop, pixel));
  } catch (error) {
    request.log('counters-failed', { shopId: shop.id, error: errorText(error) });
    return null;
  }
}
