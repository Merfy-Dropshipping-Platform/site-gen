import type { Entity } from '@merfy/storefront-build';
import { isCounterNumber, type CounterKind } from '@merfy/storefront-config';
import { z } from 'zod';
import { StorefrontBuilderError, errorText } from './errors';
import type { Log } from './log';
import type { Call } from './rpc';

// Счётчики и «свой код» мерчанта магазина (design.md блока 11, С11-4 Б; блок 13 «Секций и SDK», часть 13б): сборщик
// витрин читает их у сборщика аналитики тем же RPC, что кабинет через шлюз (analytics.pixels.list, очередь
// analytics_queue), и записывает в снимок. Включённые счётчики трёх видов с номером по правилу вида (блок 3) — сущности
// counter; включённый непустой «свой код» — сущность custom-code с отметкой согласия (none — сразу, иначе required —
// после «Принять»), не больше CUSTOM_CODE_MAX_BYTES на магазин по порядку id. Meta, номер не по правилу и код сверх
// предела — мимо, со строкой журнала без номера и кода. Сервис не ответил или ответил неуспехом — null: снимок «не
// получен», сборки нет (как с товарами, snapshot.ts).
export const ANALYTICS_QUEUE = 'analytics_queue';
const PIXELS_LIST = 'analytics.pixels.list';
// Список не отдаёт дату правки: дата одна на все счётчики, ключ сборки меняет правка самих данных.
export const COUNTER_UPDATED_AT = '1970-01-01T00:00:00.000Z';
// «Свой код» (часть 13б): вид пикселя у сборщика аналитики и предел байтов UTF-8 на магазин («Решил сам» 5 блока 13).
export const CUSTOM_PIXEL = 'custom';
export const CUSTOM_CODE_MAX_BYTES = 64 * 1024;

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
  // Отметка «своего кода» (часть 13б): сборщик аналитики до 13б её не отдаёт — тогда required.
  consent: z.string().optional(),
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

const consentOf = (value: string | undefined): 'required' | 'none' => (value === 'none' ? 'none' : 'required');

// «Свой код» по порядку id: включённый и непустой, пока сумма байтов не больше предела; не влез — строка без кода,
// следующий ещё может влезть.
function customEntities(request: CounterRequest, shop: CounterShop, pixels: readonly Pixel[]): Entity[] {
  const codes = pixels
    .filter((pixel) => pixel.is_active && pixel.pixel_type === CUSTOM_PIXEL && pixel.pixel_id.trim() !== '')
    .sort((left, right) => (left.id < right.id ? -1 : 1));
  let used = 0;
  return codes.flatMap((pixel): Entity[] => {
    const bytes = Buffer.byteLength(pixel.pixel_id, 'utf8');
    if (used + bytes > CUSTOM_CODE_MAX_BYTES) {
      request.log('custom-code-skipped', { shopId: shop.id, counterId: pixel.id, bytes });
      return [];
    }
    used += bytes;
    const data = { code: pixel.pixel_id, consent: consentOf(pixel.consent) };
    return [{ type: 'custom-code', id: pixel.id, updatedAt: COUNTER_UPDATED_AT, data }];
  });
}

function counterEntity(request: CounterRequest, shop: CounterShop, pixel: Pixel): Entity[] {
  if (!pixel.is_active || pixel.pixel_type === CUSTOM_PIXEL) return [];
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
    const { pixels } = answer.data;
    return [
      ...pixels.flatMap((pixel) => counterEntity(request, shop, pixel)),
      ...customEntities(request, shop, pixels),
    ];
  } catch (error) {
    request.log('counters-failed', { shopId: shop.id, error: errorText(error) });
    return null;
  }
}
