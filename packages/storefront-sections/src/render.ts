import type { ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { RenderBlock, RenderStage } from '@merfy/storefront-build';
import { z } from 'zod';
import { defaultLaunch, spawnIsolated, type IsolatedLaunch } from './isolation';
import type { SettingValues } from './trial-render';
import { WORKER_FILES } from './worker-files';

// Процесс рендера секций (блок 1 «Секций и SDK»; песочница — блок 2, «Решил сам» пп. 2–4). Сборщик рендерит секции не у
// себя: модуль шаблона любого автора идёт в отдельный процесс Node с правами isolation.ts. Процесс запускается при первом
// рендере; модуль уходит в процесс один раз на хеш, дальше — только хеш и значения настроек
// (render-worker.ts). В работе — один запрос: срок секции считается с отправки её запроса. Канал ответа процессу не
// доверяет: рамка с ключом процесса, id запроса в работе и длиной не больше предела; иначе процесс убит. Срок, размер
// ответа и память — снаружи процесса: нарушение — SIGKILL, отказ этой секции со стадией для таблицы ошибок, следующая
// секция рендерится в свежем процессе. После limits.renders рендеров процесс тоже заменяется свежим.
export interface SectionRenderRequest {
  section: string;
  hash: string;
  module: string;
  settings: SettingValues;
  // Часть 3: показанные блоки секции и режим превью (метки блоков); нет — блоков нет, режим — витрина.
  blocks?: readonly RenderBlock[];
  preview?: boolean;
}

export interface SectionRenderer {
  render: (request: SectionRenderRequest) => Promise<string>;
  // pid процесса рендера; null — процесса нет: рендера ещё не было или процесс остановлен.
  pid: () => number | null;
  close: () => Promise<void>;
}

export interface RenderLimits {
  // Срок одной секции с отправки запроса, мс: дольше — render-timeout.
  timeoutMs: number;
  // Запуск процесса до ответа { ready }, мс.
  readyMs: number;
  // Ответ одной секции, байт: больше — render-output.
  sectionBytes: number;
  // Куча V8 (--max-old-space-size) и память процесса по /proc на Linux, МБ: больше — render-memory.
  memoryMb: number;
  rssMb: number;
  // Столько рендеров — и процесс заменяется свежим: состояние модулей секций не копится.
  renders: number;
}

// Сроки — меньше DRAW_TIMEOUT_MS 3000 и BUILD_DRAIN_MS 20000 сборщика (факт 6 design.md блока 2).
export const RENDER_LIMITS: RenderLimits = {
  timeoutMs: 1_000,
  readyMs: 5_000,
  sectionBytes: 1024 * 1024,
  memoryMb: 256,
  rssMb: 512,
  renders: 200,
};

export interface RendererOptions {
  // Другой процесс вместо render-worker — только для тестов.
  workerPath?: string;
  launch?: IsolatedLaunch;
  limits?: Partial<RenderLimits>;
}

// Отказ рендера секции; stage — стадия для таблицы ошибок секций (storefront_section_error).
export class SectionRenderError extends Error {
  readonly stage: RenderStage;

  constructor(stage: RenderStage, message: string) {
    super(message);
    this.name = 'SectionRenderError';
    this.stage = stage;
  }
}

const TEXT = {
  shape: 'ответ процесса рендера не по форме',
  exited: 'процесс рендера завершился',
  ready: (ms: number) => `процесс рендера не запустился за ${ms} мс`,
  timeout: (ms: number) => `секция рендерилась дольше ${ms} мс`,
  output: (bytes: number) => `ответ секции больше ${bytes} байт`,
  memory: 'процессу рендера не хватило памяти',
} as const;

const answerSchema = z.union([
  z.strictObject({ ready: z.literal(true) }),
  z.strictObject({ html: z.string() }),
  z.strictObject({ error: z.string(), denied: z.boolean() }),
]);
type Answer = z.infer<typeof answerSchema>;

interface Fault {
  stage: RenderStage;
  message: string;
}

interface Frame {
  id: number;
  answer: Answer;
}

// Рамка ответа (render-worker.ts): строка «<ключ> <id> <байт>\n» и ровно столько байт JSON.
const HEADER = /^([0-9a-f]{32}) (\d{1,10}) (\d{1,10})$/;
const HEADER_MAX_BYTES = 64;
const shape: Fault = { stage: 'render', message: TEXT.shape };

function answerOf(payload: Buffer): Answer | null {
  try {
    const parsed = answerSchema.safeParse(JSON.parse(payload.toString('utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Байты канала → рамки по одной. Чужой ключ, строка заголовка не по форме, ответ больше предела — нарушение.
class FrameReader {
  private buffer = Buffer.alloc(0);
  private expected: { id: number; bytes: number } | null = null;

  constructor(
    private readonly key: string,
    private readonly maxBytes: number,
  ) {}

  push(chunk: Buffer): Frame[] | Fault {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const frames: Frame[] = [];
    for (;;) {
      const next = this.next();
      if (next === null) return frames;
      if ('stage' in next) return next;
      frames.push(next);
    }
  }

  private next(): Frame | Fault | null {
    if (this.expected === null) return this.header();
    const { id, bytes } = this.expected;
    if (this.buffer.length < bytes) return null;
    const answer = answerOf(this.buffer.subarray(0, bytes));
    this.buffer = this.buffer.subarray(bytes);
    this.expected = null;
    return answer === null ? shape : { id, answer };
  }

  private header(): Frame | Fault | null {
    const end = this.buffer.indexOf(10);
    if (end === -1) return this.buffer.length > HEADER_MAX_BYTES ? shape : null;
    const match = HEADER.exec(this.buffer.subarray(0, end).toString('utf8'));
    this.buffer = this.buffer.subarray(end + 1);
    if (match === null || match[1] !== this.key) return shape;
    const bytes = Number(match[3]);
    if (bytes > this.maxBytes) return { stage: 'render-output', message: TEXT.output(this.maxBytes) };
    this.expected = { id: Number(match[2]), bytes };
    return this.next();
  }
}

interface Job {
  request: SectionRenderRequest;
  resolve: (html: string) => void;
  reject: (error: Error) => void;
}

interface Running {
  child: ChildProcess;
  ready: boolean;
  // Отпечатки модулей, которые этот процесс уже получил.
  sent: Set<string>;
  renders: number;
  timer: NodeJS.Timeout | null;
}

interface InFlight {
  id: number;
  job: Job;
}

const MEMORY_SIGNALS: ReadonlySet<string> = new Set(['SIGABRT', 'SIGTRAP']);
const RSS_LINE = /^VmRSS:\s+(\d+) kB$/m;
const RSS_EVERY_MS = 100;

// Память процесса по /proc (только Linux), МБ; не прочли — 0.
async function rssMb(pid: number | undefined): Promise<number> {
  const status = await readFile(`/proc/${String(pid)}/status`, 'utf8').catch(() => '');
  return Number(RSS_LINE.exec(status)?.[1] ?? 0) / 1024;
}

// Куча V8 кончилась — Node завершается через abort().
const exitFault = (signal: NodeJS.Signals | null): Fault =>
  signal !== null && MEMORY_SIGNALS.has(signal)
    ? { stage: 'render-memory', message: TEXT.memory }
    : { stage: 'render', message: TEXT.exited };

/** Живой процесс рендера: очередь запросов, один запрос в работе, пределы и замена процесса. */
class Renderer implements SectionRenderer {
  private readonly queue: Job[] = [];
  private running: Running | null = null;
  private current: InFlight | null = null;
  private nextId = 1;
  private readonly limits: RenderLimits;

  constructor(private readonly options: RendererOptions) {
    this.limits = { ...RENDER_LIMITS, ...options.limits };
  }

  render = (request: SectionRenderRequest): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      this.queue.push({ request, resolve, reject });
      this.pump();
    });

  pid = (): number | null => this.running?.child.pid ?? null;

  close = async (): Promise<void> => {
    const running = this.running;
    for (const job of this.queue.splice(0)) job.reject(new Error(TEXT.exited));
    if (running === null) return;
    const exited = running.child.exitCode !== null || running.child.signalCode !== null;
    const done = exited
      ? Promise.resolve()
      : new Promise<void>((resolve) => running.child.once('exit', () => resolve()));
    this.stop(running, new Error(TEXT.exited));
    await done;
  };

  private pump(): void {
    const job = this.queue.at(0);
    if (this.current !== null || job === undefined) return;
    const running = this.running ?? this.started();
    if (running === null || !running.ready) return;
    this.queue.shift();
    this.send(running, job);
  }

  // Процесс не запустился (нет файла процесса, бинарника) — все ждущие отклонены ошибкой без стадии.
  private started(): Running | null {
    try {
      this.running = this.start();
      return this.running;
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      for (const job of this.queue.splice(0)) job.reject(failure);
      return null;
    }
  }

  private send(running: Running, job: Job): void {
    const id = this.nextId++;
    const { hash, settings, module, blocks, preview } = job.request;
    const message = {
      id,
      hash,
      settings,
      blocks: blocks ?? [],
      preview: preview === true,
      ...(running.sent.has(hash) ? {} : { module }),
    };
    running.sent.add(hash);
    this.current = { id, job };
    this.arm(running, this.limits.timeoutMs, { stage: 'render-timeout', message: TEXT.timeout(this.limits.timeoutMs) });
    running.child.stdin?.write(`${JSON.stringify(message)}\n`);
    this.watchMemory(running, id);
  }

  // Один таймер на процесс: срок запуска или срок секции в работе.
  private arm(running: Running, ms: number, fault: Fault): void {
    if (running.timer !== null) clearTimeout(running.timer);
    running.timer = setTimeout(() => this.fail(running, fault), ms);
  }

  private watchMemory(running: Running, id: number): void {
    if (process.platform !== 'linux') return;
    const check = async (): Promise<void> => {
      if (this.current?.id !== id || this.running !== running) return;
      if ((await rssMb(running.child.pid)) > this.limits.rssMb)
        return this.fail(running, { stage: 'render-memory', message: TEXT.memory });
      setTimeout(() => void check(), RSS_EVERY_MS).unref();
    };
    setTimeout(() => void check(), RSS_EVERY_MS).unref();
  }

  private start(): Running {
    const spec = { script: this.options.workerPath ?? WORKER_FILES.render, memoryMb: this.limits.memoryMb };
    const child = spawnIsolated(spec, this.options.launch ?? defaultLaunch(), ['pipe', 'ignore', 'ignore', 'pipe']);
    const key = randomBytes(16).toString('hex');
    const running: Running = { child, ready: false, sent: new Set(), renders: 0, timer: null };
    const reader = new FrameReader(key, this.limits.sectionBytes);
    this.arm(running, this.limits.readyMs, { stage: 'render-timeout', message: TEXT.ready(this.limits.readyMs) });
    child.stdio[3]?.on('data', (chunk: Buffer) => this.onFrames(running, reader.push(chunk)));
    child.stdin?.on('error', () => undefined);
    child.on('error', (error) => this.fail(running, { stage: 'render', message: error.message }));
    child.on('exit', (_code, signal) => this.fail(running, exitFault(signal)));
    child.stdin?.write(`${key}\n`);
    return running;
  }

  private onFrames(running: Running, frames: Frame[] | Fault): void {
    if (this.running !== running) return;
    if (!Array.isArray(frames)) return this.fail(running, frames);
    for (const frame of frames) this.onFrame(running, frame);
  }

  private onFrame(running: Running, frame: Frame): void {
    if (this.running !== running) return;
    if ('ready' in frame.answer) return this.onReady(running, frame.id);
    const current = this.current;
    if (current === null || current.id !== frame.id) return this.fail(running, shape);
    this.current = null;
    if (running.timer !== null) clearTimeout(running.timer);
    running.renders += 1;
    if ('html' in frame.answer) current.job.resolve(frame.answer.html);
    else
      current.job.reject(new SectionRenderError(frame.answer.denied ? 'render-denied' : 'render', frame.answer.error));
    if (running.renders >= this.limits.renders) this.retire(running);
    this.pump();
  }

  private onReady(running: Running, id: number): void {
    if (running.ready || id !== 0) return this.fail(running, shape);
    running.ready = true;
    if (running.timer !== null) clearTimeout(running.timer);
    this.pump();
  }

  private retire(running: Running): void {
    this.running = null;
    running.child.kill('SIGKILL');
  }

  // Нарушение или конец процесса: процесс убит, запрос в работе отклонён ошибкой секции со стадией. Процесс не дошёл до
  // готовности — это сбой не секции: все ждущие отклонены ошибкой без стадии, следующий render запустит процесс заново.
  private fail(running: Running, fault: Fault): void {
    this.stop(running, running.ready ? new SectionRenderError(fault.stage, fault.message) : new Error(fault.message));
  }

  private stop(running: Running, error: Error): void {
    if (this.running !== running) return;
    this.running = null;
    if (running.timer !== null) clearTimeout(running.timer);
    running.child.kill('SIGKILL');
    const rejected = running.ready ? [] : this.queue.splice(0);
    const current = this.current;
    this.current = null;
    for (const job of [...(current === null ? [] : [current.job]), ...rejected]) job.reject(error);
    this.pump();
  }
}

export function startSectionRenderer(options: RendererOptions = {}): SectionRenderer {
  return new Renderer(options);
}

// Работа с процессом рендера: процесс закрывается после работы, даже если она упала.
export async function withSectionRenderer<T>(
  work: (render: SectionRenderer['render']) => Promise<T>,
  options: RendererOptions = {},
): Promise<T> {
  const renderer = startSectionRenderer(options);
  try {
    return await work(renderer.render);
  } finally {
    await renderer.close();
  }
}
