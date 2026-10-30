import { z } from 'zod';
import type { Broker } from '../broker';
import { errorText } from '../errors';
import type { Log } from '../log';
import { MAX_CONCURRENT_RENDERS } from './look-browser';
import { BUDGET_BYTES, fitShots, type DeviceShots } from './look-fit';
import { runLayoutChecks } from './look-layout';
import { LOOK_PATTERN, LOOKS_QUEUE } from './look-queue';
import { parseSample, type LookSample } from './look-sample';
import { cutOf, locateSection, shootSections, type SectionCut } from './look-section';
import {
  LookError,
  type LookDevice,
  type LookFinding,
  type PageFacts,
  type PageRenderer,
  type PageSession,
  type RenderedPage,
  type SectionPlace,
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
// Предел времени детектора в снимке одной секции: шлюз ждёт такой снимок 15 с, merfy-mcp — 16 с, а сам снимок секции идёт
// около 2 с. Замер детектора на главной nova — в README пакета, «Снимок черновика»; предел — с запасом. Не успел — снимок
// и проверки вёрстки отдаются без находок детектора. В снимке страницы предела нет: там срок всего задания.
export const SECTION_DETECTOR_TIMEOUT_MS = 3_000;
// До срока задания детектор секции оставляет не меньше этого: ответ шлюз должен успеть принять.
const DETECTOR_DEADLINE_MARGIN_MS = 1_500;

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
  // id экземпляра секции (`data-section-id`): снимок только этой секции, а не страницы. `full` тогда не действует.
  section: z
    .string()
    .regex(/^[A-Za-z0-9_.:-]{1,100}$/)
    .optional(),
  // Запись шаблона страницы (товар, коллекция…): id, адрес или handle — как `record=` у превью конструктора. Нет — запись
  // по умолчанию. Нашлась ли она, сказано в ответе (`record`): снимок не подменяет её молча.
  record: z.string().min(1).max(200).optional(),
  // Вырезки мест находок вёрстки: нет ключа или true — как раньше, false — только экраны, находки текстом.
  clips: z.boolean().optional(),
  // Время (мс с 1970), после которого вызывающий ответа уже не ждёт.
  deadline: z.int().positive(),
});
const envelopeSchema = z.object({ pattern: z.literal(LOOK_PATTERN), data: z.unknown() });

export type LookJob = z.infer<typeof lookJobSchema>;

export type LookErrorCode =
  | 'invalid'
  | 'expired'
  | 'preview-failed'
  | 'render-failed'
  | 'timeout'
  | 'no-browser'
  | 'section-not-found';

export interface LookDeviceShots {
  device: LookDevice;
  viewport: Viewport;
  facts: PageFacts;
  // Экранов в странице всего и сколько снято (подряд с первого). Снимок секции: 1 из 1 (секции на устройстве нет — 1 из 0).
  screens: { total: number; shown: number };
  // JPEG в base64 по порядку экранов; снимок секции — одна картинка (секции на устройстве нет — ни одной).
  images: string[];
  // Только снимок секции, иначе null: высота секции, сколько её на картинке (сверху) и снята ли без прокрутки.
  cut: SectionCut | null;
}

export interface LookSnapshot {
  v: 1;
  siteId: string;
  page: string;
  full: boolean;
  // id секции из задания; null — снимок страницы.
  section: string | null;
  // Запись, которую просили (`record` задания): нашлась ли и как называется; не просили — null. Корзина снимка — на
  // страницах корзины и оформления: сколько строк товаров магазина в ней стоит, у остальных страниц null.
  record: { type: string; asked: string; found: boolean; title: string | null } | null;
  cart: { lines: number } | null;
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

export const previewUrl = (sitesUrl: string, job: LookJob): string => {
  const base = `${sitesUrl.replace(/\/+$/, '')}/api/sites/${encodeURIComponent(job.siteId)}/preview?page=${encodeURIComponent(job.page)}`;
  return job.record === undefined ? base : `${base}&record=${encodeURIComponent(job.record)}`;
};

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

class DetectorLate extends Error {}

// Работа, которой отведено `ms`: дальше — `DetectorLate`. Саму работу это не прерывает (она закончится вместе со страницей).
async function within<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DetectorLate()), ms);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

const secondsText = (ms: number): string => String(Math.round(ms / 100) / 10);

// Детектор не должен ронять снимки: его отказ идёт в ответ причиной. С `section` — только находки внутри секции и
// не дольше `limitMs`.
async function detectOn(
  session: PageSession,
  section?: string,
  limitMs?: number,
): Promise<{ detector: LookSnapshot['detector']; findings: LookFinding[] }> {
  try {
    const running = session.detect(section);
    const found = limitMs === undefined ? await running : await within(running, limitMs);
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
    const reason =
      error instanceof DetectorLate ? `не успел за ${secondsText(limitMs ?? 0)} с` : firstLine(errorText(error));
    return { detector: { ok: false, reason }, findings: [] };
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
    cut: null,
  };
}

// Устройство снимка секции: одна картинка секции (или ни одной, если на этом устройстве её не видно).
function sectionShots(session: PageSession, place: SectionPlace | null, shot: Uint8Array | null): LookDeviceShots {
  const shown = shot === null ? 0 : 1;
  return {
    device: session.device,
    viewport: session.viewport,
    facts: tidyFacts(session.facts),
    screens: { total: 1, shown },
    images: shot === null ? [] : [Buffer.from(shot).toString('base64')],
    cut: place === null ? null : cutOf(place),
  };
}

// Что превью сообщило о странице (`look-sample.ts`): показанная запись и корзина.
const factsOf = (sample: LookSample | null): Pick<LookSnapshot, 'record' | 'cart'> => ({
  record: sample?.record ?? null,
  cart: sample?.cart === undefined ? null : { lines: sample.cart.lines.length },
});

// Снимок страницы: экраны, детектор дизайна и проверки вёрстки.
async function pageSnapshot(
  sessions: PageSession[],
  first: PageSession,
  job: LookJob,
  sample: LookSample | null,
): Promise<LookSnapshot> {
  // Вырезки мест идут в тот же предел веса, что и экраны: сначала они, экранам остаётся остальное.
  const checks = await runLayoutChecks(sessions, undefined, job.clips !== false);
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
    section: null,
    ...factsOf(sample),
    devices,
    detector,
    layout: checks.status,
    findings: [...findings, ...checks.findings],
  };
}

// Детектор в снимке секции (после снимков и проверок): тот же, что у страницы, на первом устройстве, где секцию видно, —
// находки только внутри неё (`look-page.ts`, `DETECT_IN_SECTION_BODY`), в пределе времени. Секции не видно нигде
// (на всех устройствах скрыта) сюда не доходят: `locateSection` уже ответил отказом.
async function detectInSection(
  sessions: PageSession[],
  places: Array<SectionPlace | null>,
  section: string,
  room: number,
): ReturnType<typeof detectOn> {
  const session = sessions.find((_, index) => places[index] != null);
  if (session === undefined) return { detector: { ok: false, reason: 'секции не видно' }, findings: [] };
  const limit = Math.min(SECTION_DETECTOR_TIMEOUT_MS, room - DETECTOR_DEADLINE_MARGIN_MS);
  if (limit <= 0) return { detector: { ok: false, reason: 'не успел: срок снимка почти вышел' }, findings: [] };
  return detectOn(session, section, limit);
}

// Снимок одной секции: её вырезка, находки вёрстки в ней и находки детектора дизайна по её элементам.
async function sectionSnapshot(
  sessions: PageSession[],
  job: LookJob,
  section: string,
  now: () => number,
  sample: LookSample | null,
): Promise<LookSnapshot> {
  const places = await locateSection(sessions, section);
  const checks = await runLayoutChecks(sessions, section, job.clips !== false);
  const { shots } = await shootSections(sessions, places, section, BUDGET_BYTES - checks.clipBytes);
  const { detector, findings } = await detectInSection(sessions, places, section, job.deadline - now());
  const devices = sessions.map((session, index) => sectionShots(session, places[index] ?? null, shots[index] ?? null));
  return {
    v: 1,
    siteId: job.siteId,
    page: job.page,
    full: false,
    section,
    ...factsOf(sample),
    devices,
    detector,
    layout: checks.status,
    findings: [...findings, ...checks.findings],
  };
}

async function snapshotOf(
  sessions: PageSession[],
  job: LookJob,
  now: () => number,
  sample: LookSample | null,
): Promise<LookSnapshot> {
  const [first] = sessions;
  if (first === undefined) throw new Error('отрисовщик не открыл ни одного экрана');
  return job.section === undefined
    ? pageSnapshot(sessions, first, job, sample)
    : sectionSnapshot(sessions, job, job.section, now, sample);
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
    return { ok: true, snapshot: await snapshotOf(rendered.sessions, job, deps.now, parseSample(html)) };
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
  const fields = {
    shopId: job?.siteId ?? null,
    page: job?.page ?? null,
    section: job?.section ?? null,
    ms: deps.now() - startedAt,
  };
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
