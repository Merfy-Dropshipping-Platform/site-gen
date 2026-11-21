import { z } from 'zod';
import type { Broker } from '../broker';
import type { Log } from '../log';
import { DESIGN_PATTERN, DESIGNS_QUEUE } from './design-queue';
import type { RunDeps, RunInput } from './design-run';
import { DesignError, designFailure, type DesignReply } from './design-types';

// Задание «Дизайн по ссылке» в проверяющем процессе (раздел 2 контракта): RPC в формате ClientProxy Nest, как у
// снимков черновика (`look/look-job.ts`). Сообщение `{ pattern: 'storefront.design', id, data }` в очередь
// storefront_designs (durable), свойства `replyTo`, `correlationId`, `expiration`; ответ — `{ err: null, response,
// isDisposed: true, id }` на `replyTo` с тем же correlationId. Зовёт шлюз (`POST /api/sites/:id/design-look`).
// Свои места (DESIGN_SLOTS, по умолчанию 1) и свой срок (DESIGN_TIMEOUT_MS, 60 с): снимки черновика дизайна не ждут, и
// наоборот.

export const DEFAULT_SLOTS = 1;
export const DEFAULT_TIMEOUT_MS = 60_000;
// Меньше этого до срока вызывающего — не начинаем: он ответа уже не дождётся.
export const MIN_BUDGET_MS = 5_000;
const URL_MAX = 2000;

const jobSchema = z.strictObject({
  v: z.literal(1),
  siteId: z.string().min(1).max(100),
  url: z
    .string()
    .max(URL_MAX)
    .refine(
      (value) => URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol),
      'нужен http(s)-адрес',
    ),
  owned: z.boolean(),
  deadline: z.int().positive(),
});
const envelopeSchema = z.object({ pattern: z.literal(DESIGN_PATTERN), data: z.unknown() });

export type DesignJob = z.infer<typeof jobSchema>;

export function parseDesignJob(body: unknown): DesignJob | null {
  const envelope = envelopeSchema.safeParse(body);
  const job = envelope.success ? jobSchema.safeParse(envelope.data.data) : null;
  return job?.success === true ? job.data : null;
}

export interface DesignSettings {
  slots: number;
  timeoutMs: number;
}

const settingsSchema = z.object({
  DESIGN_SLOTS: z.coerce.number().int().min(1).max(8).default(DEFAULT_SLOTS),
  DESIGN_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(300_000).default(DEFAULT_TIMEOUT_MS),
});

export function readDesignSettings(env: NodeJS.ProcessEnv): DesignSettings {
  const parsed = settingsSchema.parse({ DESIGN_SLOTS: env.DESIGN_SLOTS, DESIGN_TIMEOUT_MS: env.DESIGN_TIMEOUT_MS });
  return { slots: parsed.DESIGN_SLOTS, timeoutMs: parsed.DESIGN_TIMEOUT_MS };
}

export interface JobDeps {
  run: (input: RunInput) => Promise<DesignReply>;
  timeoutMs: number;
  now: () => number;
}

const firstLine = (value: unknown): string =>
  (String(value instanceof Error ? value.message : value).split('\n')[0] ?? '').slice(0, 300);

export function failureOf(error: unknown): DesignReply {
  if (error instanceof DesignError) return designFailure(error.code, firstLine(error.message));
  return designFailure('tool-failed', `Снять дизайн не получилось: ${firstLine(error)}`);
}

// Одно задание: разобрать, снять, ответить. Не бросает — любой исход становится ответом контракта.
export async function runDesignJob(deps: JobDeps, body: unknown): Promise<DesignReply> {
  const job = parseDesignJob(body);
  if (job === null) return designFailure('invalid', 'Задание дизайна не по форме');
  const now = deps.now();
  if (job.deadline - now < MIN_BUDGET_MS) return designFailure('timeout', 'Снятие не успело начаться: очередь занята');
  const deadline = Math.min(job.deadline, now + deps.timeoutMs);
  return deps.run({ url: job.url, owned: job.owned, deadline }).catch(failureOf);
}

export const nestReply = (reply: DesignReply, id: string | undefined) => ({
  err: null,
  response: reply,
  isDisposed: true,
  ...(id === undefined ? {} : { id }),
});

const hostOf = (body: unknown): string | null => {
  const job = parseDesignJob(body);
  return job === null ? null : new URL(job.url).host;
};

function logOutcome(log: Log, body: unknown, reply: DesignReply, ms: number): void {
  const fields = { shopId: parseDesignJob(body)?.siteId ?? null, host: hostOf(body), ms };
  if (!reply.ok) {
    log('design-failed', { ...fields, code: reply.error.code, error: reply.error.message });
    return;
  }
  log('design-done', {
    ...fields,
    tool: reply.tool,
    outlineTool: reply.outlineTool,
    bands: reply.style.bands.length,
    blocks: reply.outline.blocks.length,
    owned: reply.content !== null,
  });
}

export interface StartDeps extends JobDeps {
  slots: number;
  log: Log;
}

// Задания дизайна — не больше DESIGN_SLOTS разом, отдельно от снимков черновика и проверок выпуска.
export async function startDesigns(broker: Pick<Broker, 'consume' | 'reply'>, deps: StartDeps): Promise<void> {
  await broker.consume(DESIGNS_QUEUE, deps.slots, async ({ body, replyTo, correlationId }) => {
    const startedAt = deps.now();
    const reply = await runDesignJob(deps, body);
    logOutcome(deps.log, body, reply, deps.now() - startedAt);
    if (replyTo !== undefined) await broker.reply(replyTo, correlationId, nestReply(reply, correlationId));
  });
}

export type { RunDeps };
