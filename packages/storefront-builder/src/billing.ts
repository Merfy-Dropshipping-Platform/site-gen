import type { Entity } from '@merfy/storefront-build';
import { z } from 'zod';
import { errorText } from './errors';
import type { Log } from './log';
import type { Call } from './rpc';

// Оплата онлайн магазина (блок 1 «Секций и SDK», часть 4, Р1-4-6) — для значков оплаты в подвале: публичные настройки
// оплаты у сервиса billing, как у подвала пяти тем (site-gen, src/utils/footer-data.ts). Правило «принимает оплату» —
// то же: activeProvider не null; billing без этого поля — ЮKassa включена и номер её магазина есть. billing не ответил
// — значков нет, сборка идёт (как на проде); причина — в журнале. Дата правки — постоянная, как у товаров.
export const BILLING_QUEUE = 'billing_queue';
const GET_PUBLIC = 'billing.shop_payment_settings.get_public';
const BILLING_UPDATED_AT = '1970-01-01T00:00:00.000Z';

const answerSchema = z.object({
  success: z.boolean(),
  yookassaEnabled: z.boolean().optional(),
  yookassaShopId: z.string().nullable().optional(),
  activeProvider: z.string().nullable().optional(),
});

export interface BillingRequest {
  call: Call;
  timeoutMs: number;
  log: Log;
}

function acceptsOnline(answer: z.infer<typeof answerSchema>): boolean {
  if (!answer.success) return false;
  if (answer.activeProvider !== undefined) return answer.activeProvider !== null;
  return answer.yookassaEnabled === true && Boolean(answer.yookassaShopId);
}

const billingEntity = (online: boolean): Entity => ({
  type: 'billing',
  id: 'main',
  updatedAt: BILLING_UPDATED_AT,
  data: { online },
});

export async function fetchBilling(request: BillingRequest, shopId: string): Promise<Entity> {
  try {
    const raw = await request.call(BILLING_QUEUE, GET_PUBLIC, { shopId }, request.timeoutMs);
    return billingEntity(acceptsOnline(answerSchema.parse(raw)));
  } catch (error) {
    request.log('billing-failed', { shopId, error: errorText(error) });
    return billingEntity(false);
  }
}
