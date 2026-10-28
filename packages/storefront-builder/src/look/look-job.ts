import { z } from 'zod';
import type { Broker } from '../broker';
import { errorText } from '../errors';
import type { Log } from '../log';
import { MAX_CONCURRENT_RENDERS } from './look-browser';
import { BUDGET_BYTES, fitShots, type DeviceShots } from './look-fit';
import { runLayoutChecks } from './look-layout';
import { LOOK_PATTERN, LOOKS_QUEUE } from './look-queue';
import {
  LookError,
  type LookDevice,
  type LookFinding,
  type PageFacts,
  type PageRenderer,
  type PageSession,
  type RenderedPage,
  type Viewport,
} from './look-types';

// Снимок черновика (задание проверяющего процесса, 28.10): страница черновика магазина картинками, фактами и находками
// детектора. Зовёт шлюз (`POST /api/sites/:id/look`) вызовом RPC в формате ClientProxy Nest: сообщение
// { pattern: 'storefront.look', data, id } в очередь storefront_looks, ответ — { err, response, isDisposed, id } на адрес
// ответа с тем же correlationId. HTML берётся тем же путём, что превью конструктора: GET sites
// /api/sites/:id/preview?page= (развилка «новая тема или нынешние» — в sites, StandPreviewMiddleware). Контракт целиком —
// README пакета, «Снимок черновика».

export { LOOKS_QUEUE, LOOK_PATTERN };
// Срок на чтение превью у sites; дальше — отрисовка в своём сроке (`RENDER_TIMEOUT_MS`).
export const PREVIEW_TIMEOUT_MS = 10_000;
// До срока задания осталось меньше — не берёмся: ответ шлюз уже не дождётся.
export const MIN_BUDGET_MS = 5_000;
// Сообщения консоли в ответе: первые и не длиннее предела — ответ идёт через брокер.
const MAX_CONSOLE_ERRORS = 50;
const MAX_CONSOLE_LENGTH = 500;

const DEVICE_SETS: Record<'mobile' | 'desktop' | 'both', LookDevice[]> = {
  mobile: ['mobile'],
  desktop: ['desktop'],
  // Телефон всегда первым: и в картинках, и для детектора.
  both: ['mobile', 'desktop'],
};

const lookJobSchema = z.strictObject({
  v: z.literal(1),
  siteId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  // id страницы черновика: home, catalog, page-custom-…
  page: z.string().min(1).max(200),
  devices: z.enum(['mobile', 'desktop', 'both']),
  full: z.boolean(),
  // Время (мс с 1970), после которого вызывающий ответа уже не ждёт.
  deadline: z.int().positive(),
});
const envelopeSchema = z.object({ pattern: z.literal(LOOK_PATTERN), data: z.unknown() });

export type LookJob = z.infer<typeof lookJobSchema>;

export type LookErrorCode = 'invalid' | 'expired' | 'preview-failed' | 'render-failed' | 'timeout' | 'no-browser';

export interface LookDeviceShots {
  device: LookDevice;
  viewport: Viewport;
  facts: PageFacts;
  // Экранов в странице всего и сколько снято (подряд с первого).
  screens: { total: number; shown: number };
  // JPEG в base64 по порядку экранов.
  images: string[];
}

export interface LookSnapshot {
  v: 1;
  siteId: string;
  page: string;
  full: boolean;
  devices: LookDeviceShots[];
  detector: { ok: true } | { ok: false; reason: string };
  // Проверки вёрстки (`look-layout.ts`): отказ одного устройства не мешает остальным, причина — сюда.
  layout: { ok: true } | { ok: false; reason: string };
  // Сначала находки детектора, потом проверок вёрстки (телефон первым).
  findings: LookFinding[];
}

export type LookReply =
  | { ok: true; snapshot: LookSnapshot }
  | { ok: false; error: { code: LookErrorCode; message: string; status?: number } };

export interface LookDeps {
  renderer: PageRenderer;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  // Адрес sites внутри сети: http://sites-service-dev:3114 на dev.
  sitesUrl: string;
  log: Log;
  now: () => number;
}

type LookFailure = Extract<LookReply, { ok: false }>;

const failure = (code: LookErrorCode, message: string, status?: number): LookFailure => ({
  ok: false,
  error: status === undefined ? { code, message } : { code, message, status },
});

const firstLine = (text: string): string => (text.split('\n')[0] ?? '').slice(0, 200);

export function parseLookJob(body: unknown): LookJob | null {
  const envelope = envelopeSchema.safeParse(body);
  if (!envelope.success) return null;
  const job = lookJobSchema.safeParse(envelope.data.data);
  return job.success ? job.data : null;
}

export const previewUrl = (sitesUrl: string, job: LookJob): string =>
  `${sitesUrl.replace(/\/+$/, '')}/api/sites/${encodeURIComponent(job.siteId)}/preview?page=${encodeURIComponent(job.page)}`;

type Preview = { ok: true; html: string } | LookFailure;

async function readPreview(deps: LookDeps, job: LookJob, budgetMs: number): Promise<Preview> {
  let response: Response;
  try {
    response = await deps.fetch(previewUrl(deps.sitesUrl, job), {
      headers: { accept: 'text/html' },
      signal: AbortSignal.timeout(Math.min(PREVIEW_TIMEOUT_MS, budgetMs)),
    });
  } catch (error) {
    return failure('preview-failed', `Не получил превью страницы: ${firstLine(errorText(error))}`);
  }
  if (!response.ok) {
    return failure('preview-failed', `Не получил превью страницы: sites ответил ${response.status}`, response.status);
  }
  if (!(response.headers.get('content-type') ?? '').includes('text/html')) {
    return failure('preview-failed', 'Не получил превью страницы: пришёл не HTML');
  }
  return { ok: true, html: await response.text() };
}

// Детектор не должен ронять снимки: его отказ идёт в ответ причиной.
async function detectOn(
  session: PageSession,
): Promise<{ detector: LookSnapshot['detector']; findings: LookFinding[] }> {
  try {
    const found = await session.detect();
    const findings = found.map((finding) => ({
      source: 'impeccable' as const,
      code: finding.rule,
      name: finding.name,
      text: finding.detail,
      device: session.device,
      section: null,
      clip: null,
      image: null,
    }));
    return { detector: { ok: true }, findings };
  } catch (error) {
    if (error instanceof LookError) throw error;
    return { detector: { ok: false, reason: firstLine(errorText(error)) }, findings: [] };
  }
}

const tidyFacts = (facts: PageFacts): PageFacts => ({
  ...facts,
  consoleErrors: facts.consoleErrors.slice(0, MAX_CONSOLE_ERRORS).map((text) => text.slice(0, MAX_CONSOLE_LENGTH)),
});

function deviceShots(session: PageSession, shots: DeviceShots): LookDeviceShots {
  return {
    device: session.device,
    viewport: session.viewport,
    facts: tidyFacts(session.facts),
    screens: { total: shots.total, shown: shots.shots.length },
    images: shots.shots.map((shot) => Buffer.from(shot).toString('base64')),
  };
}

async function snapshotOf(sessions: PageSession[], job: LookJob): Promise<LookSnapshot> {
  const [first] = sessions;
  if (first === undefined) throw new Error('отрисовщик не открыл ни одного экрана');
  // Вырезки мест идут в тот же предел веса, что и экраны: сначала они, экранам остаётся остальное.
  const checks = await runLayoutChecks(sessions);
  const shots = await fitShots(sessions, job.full, BUDGET_BYTES - checks.clipBytes);
  const { detector, findings } = await detectOn(first);
  const devices = sessions.map((session, index) =>
    deviceShots(session, shots[index] ?? { device: session.device, total: 1, shots: [] }),
  );
  return {
    v: 1,
    siteId: job.siteId,
    page: job.page,
    full: job.full,
    devices,
    detector,
    layout: checks.status,
    findings: [...findings, ...checks.findings],
  };
}

function renderFailure(error: unknown): LookReply {
  if (error instanceof LookError) return failure(error.code, error.message);
  return failure('render-failed', `Не получилось отрисовать страницу: ${firstLine(errorText(error))}`);
}

async function render(deps: LookDeps, job: LookJob, html: string): Promise<LookReply> {
  const timeoutMs = job.deadline - deps.now();
  let rendered: RenderedPage;
  try {
    rendered = await deps.renderer.open({ html, devices: DEVICE_SETS[job.devices], timeoutMs });
  } catch (error) {
    return renderFailure(error);
  }
  try {
    return { ok: true, snapshot: await snapshotOf(rendered.sessions, job) };
  } catch (error) {
    return renderFailure(error);
  } finally {
    await rendered.close();
  }
}

// Одно задание целиком: разобрать, прочитать превью, отрисовать. Не бросает — любой исход становится ответом.
export async function runLookJob(deps: LookDeps, body: unknown): Promise<LookReply> {
  const job = parseLookJob(body);
  if (job === null) return failure('invalid', 'Задание снимка не по форме');
  const budgetMs = job.deadline - deps.now();
  if (budgetMs < MIN_BUDGET_MS) return failure('expired', 'Снимок не успел начаться: очередь снимков занята');
  const preview = await readPreview(deps, job, budgetMs);
  if (!preview.ok) return preview;
  return render(deps, job, preview.html);
}

function logOutcome(deps: LookDeps, body: unknown, reply: LookReply, startedAt: number): void {
  const job = parseLookJob(body);
  const fields = { shopId: job?.siteId ?? null, page: job?.page ?? null, ms: deps.now() - startedAt };
  if (!reply.ok) {
    deps.log('look-failed', { ...fields, code: reply.error.code, error: reply.error.message });
    return;
  }
  const { findings, layout } = reply.snapshot;
  const clips = findings.flatMap((finding) => (finding.image === null ? [] : [finding.image]));
  const images = [...reply.snapshot.devices.flatMap((device) => device.images), ...clips];
  const kb = Math.round(images.reduce((sum, image) => sum + image.length, 0) / 1024);
  const devices = reply.snapshot.devices.map((device) => device.device).join(',');
  const checks = findings.filter((finding) => finding.source === 'layout').length;
  deps.log('look-done', { ...fields, devices, full: reply.snapshot.full, images: images.length, kb, checks });
  if (!layout.ok) deps.log('look-layout-failed', { ...fields, error: layout.reason });
}

// Ответ в формате ClientProxy Nest: его разбирает и наш клиент шлюза, и любой ClientProxy.send.
export const nestReply = (reply: LookReply, id: string | undefined) => ({
  err: null,
  response: reply,
  isDisposed: true,
  ...(id === undefined ? {} : { id }),
});

// Задания снимков — не больше двух разом (столько мест у отрисовщика), отдельно от заданий проверки выпуска.
export async function startLooks(broker: Pick<Broker, 'consume' | 'reply'>, deps: LookDeps): Promise<void> {
  await broker.consume(LOOKS_QUEUE, MAX_CONCURRENT_RENDERS, async ({ body, replyTo, correlationId }) => {
    const startedAt = deps.now();
    const reply = await runLookJob(deps, body);
    logOutcome(deps, body, reply, startedAt);
    if (replyTo !== undefined) await broker.reply(replyTo, correlationId, nestReply(reply, correlationId));
  });
}
