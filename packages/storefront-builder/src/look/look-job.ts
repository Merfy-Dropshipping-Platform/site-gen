import { z } from 'zod';
import type { LatestAudit } from '../audit/contract';
import { readLatestAudit } from '../audit/read';
import type { Broker } from '../broker';
import { lighthouseFindings } from '../checks/browser/lighthouse';
import { semanticBrowser } from '../checks/browser/semantic';
import { vitalsCheck } from '../checks/browser/vitals';
import { inSections, onPlatformSections, type CheckReport } from '../checks/finding';
import { platformSections } from '../checks/html/platform';
import { semanticHtml } from '../checks/html/semantic';
import { errorText } from '../errors';
import type { Log } from '../log';
import { MAX_CONCURRENT_RENDERS } from './look-browser';
import { BUDGET_BYTES, base64Size, fitShots, type DeviceShots } from './look-fit';
import { runLayoutChecks } from './look-layout';
import { MOTION_RESERVE_BYTES, captureMotion, motionBudget, motionDevice, type LookMotion } from './look-motion';
import { LOOK_PATTERN, LOOKS_QUEUE } from './look-queue';
import { parseSample, type LookSample } from './look-sample';
import { cutOf, locateSection, shootSections, type SectionCut } from './look-section';
import {
  LookError,
  type LookDevice,
  type LookFinding,
  type LookMark,
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
// Предел проверки меток: в снимке секции — как у детектора, в снимке страницы меток больше. Не успела — ответ без неё:
// молчание проверки не красное.
export const SECTION_MARKS_TIMEOUT_MS = 3_000;
export const PAGE_MARKS_TIMEOUT_MS = 8_000;
// Предел axe в странице: на главной nova 0,3 с (прогон 16.11). В снимке секции — с запасом под срок шлюза, в снимке
// страницы — свободнее. Не успел — проверки по HTML всё равно в ответе, причина — в `checks.failed`.
export const SECTION_SEMANTIC_TIMEOUT_MS = 2_000;
export const PAGE_SEMANTIC_TIMEOUT_MS = 5_000;
// Предел чтения Web Vitals (`checks/browser/vitals.ts`): данные собраны при загрузке, чтение — доли секунды.
export const VITALS_TIMEOUT_MS = 1_000;
// Предел Lighthouse по вкладке (`checks/browser/lighthouse.ts`): на главной nova 2,1 с (замер 18.11, Mac), на сервере
// дольше. Прервать его нельзя, поэтому он начинается, только если до срока остаётся время и на него, и на проверку
// меток: не успев, он мешал бы ей на той же странице.
export const SECTION_LIGHTHOUSE_TIMEOUT_MS = 6_000;
export const PAGE_LIGHTHOUSE_TIMEOUT_MS = 10_000;
export const MIN_LIGHTHOUSE_MS = 3_000;
// Сверх предела — на метку, начатую в последний момент; дальше проверка считается зависшей.
export const MARKS_OVERRUN_MS = 2_000;

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
  // Секции, чьи находки проверок (`checks`) отдать: изменённые правкой (`checkScope` записи в sites). Нет — секция
  // снимка (`section`), а у снимка страницы — все. Снимают картинку по-прежнему только `section`.
  sections: z
    .array(z.string().regex(/^[A-Za-z0-9_.:-]{1,100}$/))
    .min(1)
    .max(30)
    .optional(),
  // Запись шаблона страницы (товар, коллекция…): id, адрес или handle — как `record=` у превью конструктора. Нет — запись
  // по умолчанию. Нашлась ли она, сказано в ответе (`record`): снимок не подменяет её молча.
  record: z.string().min(1).max(200).optional(),
  // Вырезки мест находок вёрстки: нет ключа или true — как раньше, false — только экраны, находки текстом.
  clips: z.boolean().optional(),
  // Раскадровка анимаций (`look-motion.ts`, 12.11): кадры секций страницы и список анимаций. В снимке секции не действует.
  motion: z.boolean().optional(),
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
  // Находки мест проверок (`src/checks/`) в общем виде: семантика по HTML и в странице, Web Vitals загрузки, Lighthouse
  // по вкладке. Только секций из `sections` задания (нет — секции снимка; снимок страницы — все). Проверка не
  // отработала — причина в `failed`.
  checks: CheckReport;
  // Проверка меток витрины кликами (`look-marks.ts`): отказ самой проверки — причина, а не поломка магазина.
  marks: { ok: true; results: LookMark[] } | { ok: false; reason: string };
  // Раскадровка (`look-motion.ts`): есть только если просили (`motion` задания) и снимок страницы, а не секции.
  motion?: LookMotion;
  // Последний аудит этой страницы после публикации (`audit/`, место проверок `audit`): только снимок страницы; аудита
  // не было или его не прочитали — поля нет.
  audit?: LatestAudit;
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

// Метки на каждом устройстве по очереди, последними: клики меняют страницу. Срок снимка вышел — отвечает отрисовщик.
async function marksOn(sessions: PageSession[], limitMs: number, section?: string): Promise<LookSnapshot['marks']> {
  if (limitMs <= 0) return { ok: false, reason: 'не успел: срок снимка почти вышел' };
  try {
    const results: LookMark[] = [];
    for (const session of sessions) {
      const found = await within(session.marks(limitMs, section), limitMs + MARKS_OVERRUN_MS);
      results.push(...found.map((mark) => ({ ...mark, device: session.device })));
    }
    return { ok: true, results };
  } catch (error) {
    if (error instanceof LookError) throw error;
    const reason =
      error instanceof DetectorLate ? `не успел за ${secondsText(limitMs)} с` : firstLine(errorText(error));
    return { ok: false, reason };
  }
}

// Пределы проверок в открытой странице. У Lighthouse — функцией: его предел считается, когда до него дошла очередь.
interface BrowserLimits {
  semantic: number;
  vitals: number;
  lighthouse: () => number;
}

// Проверки мест `html` и `browser` (`src/checks/`): HTML превью — без браузера, в открытой странице — axe, Web Vitals и
// Lighthouse, каждая в своём пределе. Отказ одной проверки не мешает другим и снимку — он идёт в `failed`.
async function checksOn(
  html: string,
  session: PageSession | undefined,
  wanted: readonly string[] | undefined,
  limits: BrowserLimits,
): Promise<CheckReport> {
  const parts = [await htmlChecks(html), ...(await browserChecks(session, limits))];
  const vitals = parts.find((part) => part.vitals !== undefined)?.vitals;
  return {
    findings: inSections(
      onPlatformSections(
        parts.flatMap((part) => part.findings),
        platformSections(html),
      ),
      wanted,
    ),
    failed: parts.flatMap((part) => part.failed),
    ...(vitals === undefined ? {} : { vitals }),
  };
}

async function htmlChecks(html: string): Promise<CheckReport> {
  try {
    return { findings: await semanticHtml(html), failed: [] };
  } catch (error) {
    return { findings: [], failed: [{ place: 'html', check: 'semantic', reason: firstLine(errorText(error)) }] };
  }
}

// Ответ страницы не по форме — первая ошибка разбора с путём (текст ZodError — JSON всех ошибок, первая строка — «[»).
const checkFailure = (error: unknown): string => {
  if (!(error instanceof z.ZodError)) return firstLine(errorText(error));
  const issue = error.issues[0];
  const path = issue === undefined || issue.path.length === 0 ? 'весь ответ' : issue.path.join('.');
  return `ответ страницы не по форме: ${path} — ${issue?.message ?? 'не тот вид'}`.slice(0, 200);
};

// Разбор ответа страницы: находки и, у Web Vitals, сводка замера.
type Parsed = Pick<CheckReport, 'findings' | 'vitals'>;
const semanticParsed = (raw: unknown): Parsed => ({ findings: semanticBrowser(raw) });
const lighthouseParsed = (raw: unknown): Parsed => ({ findings: lighthouseFindings(raw) });

// Одна проверка в открытой странице: работа страницы в пределе `limitMs` и разбор её ответа. Меньше `minMs` — не
// начинается.
async function browserCheck(
  check: string,
  limitMs: number,
  work: () => Promise<unknown>,
  parse: (raw: unknown) => Parsed,
  minMs = 1,
): Promise<CheckReport> {
  const refused = (reason: string): CheckReport => ({ findings: [], failed: [{ place: 'browser', check, reason }] });
  if (limitMs < minMs) return refused('не успел: срок снимка почти вышел');
  try {
    return { ...parse(await within(work(), limitMs)), failed: [] };
  } catch (error) {
    if (error instanceof LookError) throw error;
    return refused(error instanceof DetectorLate ? `не успел за ${secondsText(limitMs)} с` : checkFailure(error));
  }
}

// По очереди, на одной странице: axe, Web Vitals (данные загрузки, телефон первым), Lighthouse — самый долгий, последним.
async function browserChecks(session: PageSession | undefined, limits: BrowserLimits): Promise<CheckReport[]> {
  if (session === undefined) {
    const failed = ['semantic', 'vitals', 'lighthouse'].map((check) => ({
      place: 'browser' as const,
      check,
      reason: 'секции не видно',
    }));
    return [{ findings: [], failed }];
  }
  const device = session.device;
  return [
    await browserCheck('semantic', limits.semantic, () => session.semantic(), semanticParsed),
    await browserCheck(
      'vitals',
      limits.vitals,
      () => session.vitals(),
      (raw) => vitalsCheck(raw, device),
    ),
    await lighthouseCheck(session, limits),
  ];
}

// Lighthouse в очереди процесса: предел считается, когда до него дошла очередь. В очереди он ждёт ровно столько, чтобы
// после неё оставалось не меньше `MIN_LIGHTHOUSE_MS` на сам прогон; иначе — отказ с причиной, а не падение снимка.
function lighthouseCheck(session: PageSession, limits: BrowserLimits): Promise<CheckReport> {
  const limitMs = limits.lighthouse();
  return browserCheck(
    'lighthouse',
    limitMs,
    () => session.lighthouse(limitMs - MIN_LIGHTHOUSE_MS),
    lighthouseParsed,
    MIN_LIGHTHOUSE_MS,
  );
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

// Общее начало ответа: что за снимок и что превью сообщило о странице.
const headOf = (
  job: LookJob,
  sample: LookSample | null,
  section: string | null,
): Pick<LookSnapshot, 'v' | 'siteId' | 'page' | 'full' | 'section' | 'record' | 'cart'> => ({
  v: 1,
  siteId: job.siteId,
  page: job.page,
  full: section === null ? job.full : false,
  section,
  ...factsOf(sample),
});

// Предел Lighthouse: свой, но не больше того, что остаётся до срока за вычетом проверки меток и запаса на ответ.
const lighthouseRoom = (job: LookJob, now: () => number, own: number, marks: number): number =>
  Math.min(own, job.deadline - now() - DETECTOR_DEADLINE_MARGIN_MS - marks - MARKS_OVERRUN_MS);

// Пределы проверок в открытой странице: в снимке страницы — свои; в снимке секции — ещё и не дальше срока шлюза.
const pageLimits = (job: LookJob, now: () => number): BrowserLimits => ({
  semantic: PAGE_SEMANTIC_TIMEOUT_MS,
  vitals: VITALS_TIMEOUT_MS,
  lighthouse: () => lighthouseRoom(job, now, PAGE_LIGHTHOUSE_TIMEOUT_MS, PAGE_MARKS_TIMEOUT_MS),
});

function sectionLimits(job: LookJob, now: () => number): BrowserLimits {
  const left = job.deadline - now() - DETECTOR_DEADLINE_MARGIN_MS;
  return {
    semantic: Math.min(SECTION_SEMANTIC_TIMEOUT_MS, left),
    vitals: Math.min(VITALS_TIMEOUT_MS, left),
    lighthouse: () => lighthouseRoom(job, now, SECTION_LIGHTHOUSE_TIMEOUT_MS, SECTION_MARKS_TIMEOUT_MS),
  };
}

// Снимок страницы: экраны, детектор дизайна и проверки вёрстки.
async function pageSnapshot(
  sessions: PageSession[],
  first: PageSession,
  job: LookJob,
  now: () => number,
  html: string,
  sample: LookSample | null,
): Promise<LookSnapshot> {
  // Вырезки мест идут в тот же предел веса, что и экраны: сначала они, экранам остаётся остальное. Просили кадры
  // анимаций — им оставлен запас, иначе `full` отдал бы весь предел экранам.
  const checks = await runLayoutChecks(sessions, undefined, job.clips !== false);
  const reserve = job.motion === true ? MOTION_RESERVE_BYTES : 0;
  const shots = await fitShots(sessions, job.full, BUDGET_BYTES - checks.clipBytes - reserve);
  const { detector, findings } = await detectOn(first);
  const devices = sessions.map((session, index) =>
    deviceShots(session, shots[index] ?? { device: session.device, total: 1, shots: [] }),
  );
  const motion = job.motion === true ? await motionOn(sessions, job, checks.clipBytes, shots) : undefined;
  const report = await checksOn(html, first, job.sections, pageLimits(job, now));
  const marks = await marksOn(sessions, PAGE_MARKS_TIMEOUT_MS);
  return {
    ...headOf(job, sample, null),
    devices,
    detector,
    layout: checks.status,
    findings: [...findings, ...checks.findings],
    checks: report,
    marks,
    ...(motion === undefined ? {} : { motion }),
  };
}

// Раскадровка на одном устройстве (компьютер, а если просили только телефон — телефон): вес кадров — остаток предела
// ответа после экранов и вырезок.
async function motionOn(
  sessions: PageSession[],
  job: LookJob,
  clipBytes: number,
  shots: DeviceShots[],
): Promise<LookMotion> {
  const device = motionDevice(job.devices);
  const session = sessions.find((entry) => entry.device === device) ?? sessions[0];
  if (session === undefined) return { ok: false, reason: 'нет экрана для кадров' };
  const screens = shots.reduce(
    (sum, entry) => sum + entry.shots.reduce((inner, shot) => inner + base64Size(shot.length), 0),
    0,
  );
  return captureMotion(session, motionBudget(clipBytes + screens));
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
  html: string,
  sample: LookSample | null,
): Promise<LookSnapshot> {
  const places = await locateSection(sessions, section);
  const checks = await runLayoutChecks(sessions, section, job.clips !== false);
  const { shots } = await shootSections(sessions, places, section, BUDGET_BYTES - checks.clipBytes);
  const { detector, findings } = await detectInSection(sessions, places, section, job.deadline - now());
  const devices = sessions.map((session, index) => sectionShots(session, places[index] ?? null, shots[index] ?? null));
  const seen = sessions.filter((_, index) => places[index] != null);
  const report = await checksOn(html, seen[0], job.sections ?? [section], sectionLimits(job, now));
  const room = job.deadline - now() - DETECTOR_DEADLINE_MARGIN_MS - MARKS_OVERRUN_MS;
  const marks = await marksOn(seen, Math.min(SECTION_MARKS_TIMEOUT_MS, room), section);
  return {
    ...headOf(job, sample, section),
    devices,
    detector,
    layout: checks.status,
    findings: [...findings, ...checks.findings],
    checks: report,
    marks,
  };
}

async function snapshotOf(
  sessions: PageSession[],
  job: LookJob,
  now: () => number,
  html: string,
): Promise<LookSnapshot> {
  const [first] = sessions;
  if (first === undefined) throw new Error('отрисовщик не открыл ни одного экрана');
  const sample = parseSample(html);
  return job.section === undefined
    ? pageSnapshot(sessions, first, job, now, html, sample)
    : sectionSnapshot(sessions, job, job.section, now, html, sample);
}

function renderFailure(error: unknown): LookReply {
  if (error instanceof LookError) return failure(error.code, error.message);
  return failure('render-failed', `Не получилось отрисовать страницу: ${firstLine(errorText(error))}`);
}

async function render(deps: LookDeps, job: LookJob, html: string): Promise<LookReply> {
  const timeoutMs = job.deadline - deps.now();
  let rendered: RenderedPage;
  try {
    rendered = await deps.renderer.open({
      html,
      devices: DEVICE_SETS[job.devices],
      timeoutMs,
      ...(job.motion === true && job.section === undefined ? { motion: true } : {}),
    });
  } catch (error) {
    return renderFailure(error);
  }
  try {
    return { ok: true, snapshot: await snapshotOf(rendered.sessions, job, deps.now, html) };
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
  const previewing = readPreview(deps, job, budgetMs);
  // Аудит после публикации читается, пока идёт превью и отрисовка; только у снимка страницы.
  const audit = job.section === undefined ? readLatestAudit(deps, job.siteId, job.page) : Promise.resolve(null);
  const preview = await previewing;
  if (!preview.ok) return preview;
  return withAudit(await render(deps, job, preview.html), await audit);
}

// Последний аудит страницы после публикации — в снимок; аудита нет — снимок как был.
function withAudit(reply: LookReply, audit: LatestAudit | null): LookReply {
  return !reply.ok || audit === null ? reply : { ok: true, snapshot: { ...reply.snapshot, audit } };
}

// Картинки ответа для журнала — экраны, вырезки находок, кадры анимаций: сколько и сколько КБ.
function imagesOf(snapshot: LookSnapshot): { images: number; kb: number } {
  const clips = snapshot.findings.flatMap((finding) => (finding.image === null ? [] : [finding.image]));
  const motion = snapshot.motion?.ok
    ? snapshot.motion.sections.flatMap((entry) => entry.frames.map((frame) => frame.image))
    : [];
  const all = [...snapshot.devices.flatMap((device) => device.images), ...clips, ...motion];
  return { images: all.length, kb: Math.round(all.reduce((sum, image) => sum + image.length, 0) / 1024) };
}

// Сколько находок у проверок для журнала: вёрстки (`checks`, прежнее поле `findings`) и каждой проверки поля `checks`.
function foundByCheck(snapshot: LookSnapshot): Record<'checks' | 'semantic' | 'vitals' | 'lighthouse', number> {
  const found = (check: string): number => snapshot.checks.findings.filter((finding) => finding.check === check).length;
  return {
    checks: snapshot.findings.filter((finding) => finding.source === 'layout').length,
    semantic: found('semantic'),
    vitals: found('vitals'),
    lighthouse: found('lighthouse'),
  };
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
  const { layout } = reply.snapshot;
  const devices = reply.snapshot.devices.map((device) => device.device).join(',');
  deps.log('look-done', {
    ...fields,
    devices,
    full: reply.snapshot.full,
    ...imagesOf(reply.snapshot),
    ...foundByCheck(reply.snapshot),
  });
  for (const failed of reply.snapshot.checks.failed) {
    deps.log('look-check-failed', { ...fields, place: failed.place, check: failed.check, error: failed.reason });
  }
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
