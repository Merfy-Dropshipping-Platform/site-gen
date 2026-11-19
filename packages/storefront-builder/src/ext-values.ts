import {
  EXT_VALUE_LIMITS,
  extValueBytes,
  extValueEntity,
  type Entity,
  type ExtValue,
  type ExtValueWant,
} from '@merfy/storefront-build';
import { z } from 'zod';
import { EXTENSIONS_QUEUE } from './code';
import { errorText } from './errors';
import type { Log } from './log';
import type { Call } from './rpc';

// Значения сторов расширений с prerender (20.11): сборщик читает их у расширений сам — функцией стора без покупателя
// (extensions.fn.run, audience storefront, как шлюз на POST /store/extensions/<id>/fn/<функция>) — и кладёт в снимок
// сущностями ext-value. Записи, которые выбраны в полях секций, — пачкой recordIds на пару «расширение, функция».
// Сбой, срок (EXT_VALUE_LIMITS.callMs) и значение больше предела — этих записей в снимке нет, секция рисуется как раньше,
// строка журнала; сборка из-за этого не падает. Вызовов за сборку — не больше EXT_VALUE_LIMITS.calls, вызовы идут разом.
const FN_RUN = 'extensions.fn.run';

export interface ExtValueRequest {
  call: Call;
  log: Log;
}

const answerSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  code: z.string().optional(),
});

interface Batch {
  ext: string;
  fn: string;
  recordIds: string[];
}

function batchesOf(wants: readonly ExtValueWant[]): Batch[] {
  const batches: Batch[] = [];
  for (const want of wants) {
    for (let at = 0; at < want.recordIds.length; at += EXT_VALUE_LIMITS.ids)
      batches.push({ ext: want.ext, fn: want.fn, recordIds: want.recordIds.slice(at, at + EXT_VALUE_LIMITS.ids) });
  }
  return batches;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const valueOf = (data: unknown, id: string): ExtValue | null => {
  if (!isRecord(data)) return null;
  const parsed = z.json().nullable().safeParse(data[id]);
  return parsed.success ? parsed.data : null;
};

// Значения одной пачки: запись без значения или со значением больше предела пропускается (больше — со строкой журнала).
function entitiesOf(batch: Batch, data: unknown, shopId: string, log: Log): Entity[] {
  return batch.recordIds.flatMap((id): Entity[] => {
    const value = valueOf(data, id);
    if (value === null) return [];
    const bytes = extValueBytes(value);
    if (bytes <= EXT_VALUE_LIMITS.valueBytes) return [extValueEntity(batch.ext, batch.fn, id, value)];
    log('ext-value-too-large', {
      shopId,
      extension: batch.ext,
      fn: batch.fn,
      id,
      bytes,
      max: EXT_VALUE_LIMITS.valueBytes,
    });
    return [];
  });
}

async function readBatch(request: ExtValueRequest, shopId: string, batch: Batch): Promise<Entity[]> {
  const fields = { shopId, extension: batch.ext, fn: batch.fn, ids: batch.recordIds.length };
  try {
    const payload = {
      extensionId: batch.ext,
      shopId,
      name: batch.fn,
      input: { recordIds: batch.recordIds },
      audience: 'storefront',
    };
    const raw = await request.call(EXTENSIONS_QUEUE, FN_RUN, payload, EXT_VALUE_LIMITS.callMs);
    const answer = answerSchema.parse(raw);
    if (answer.success) return entitiesOf(batch, answer.data, shopId, request.log);
    request.log('ext-values-failed', { ...fields, error: answer.code ?? 'success = false' });
  } catch (error) {
    request.log('ext-values-failed', { ...fields, error: errorText(error) });
  }
  return [];
}

// Значения записей, которых ждут секции. Пусто — вызовов нет.
export async function fetchExtValues(
  request: ExtValueRequest,
  shopId: string,
  wants: readonly ExtValueWant[],
): Promise<Entity[]> {
  const batches = batchesOf(wants);
  const skipped = batches.length - EXT_VALUE_LIMITS.calls;
  if (skipped > 0) request.log('ext-values-skipped', { shopId, calls: skipped });
  const read = await Promise.all(
    batches.slice(0, EXT_VALUE_LIMITS.calls).map((batch) => readBatch(request, shopId, batch)),
  );
  return read.flat();
}
