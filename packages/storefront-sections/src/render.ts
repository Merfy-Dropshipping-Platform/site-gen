import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { SettingValues } from './trial-render';

// Процесс рендера секций (блок 1 «Секций и SDK»): сборщик рисует секции не у себя — модуль шаблона любого автора идёт в
// отдельный процесс Node с пустым окружением. Процесс запускается при первом рендере; модуль уходит в процесс один раз
// на отпечаток, дальше — только отпечаток и значения настроек (render-worker.ts). Ответ не по форме или чужой id —
// процесс останавливается, все ждущие рендеры получают ошибку; следующий рендер запускает новый процесс.
export interface SectionRenderRequest {
  section: string;
  hash: string;
  module: string;
  settings: SettingValues;
}

export interface SectionRenderer {
  render: (request: SectionRenderRequest) => Promise<string>;
  // pid процесса рендера; null — процесса нет: рендера ещё не было или процесс остановлен.
  pid: () => number | null;
  close: () => Promise<void>;
}

export interface RendererOptions {
  // Другой процесс вместо render-worker.ts — только для тестов.
  workerPath?: string;
}

const WORKER = fileURLToPath(new URL('./render-worker.ts', import.meta.url));
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const TEXT = { shape: 'ответ процесса рендера не по форме', exited: 'процесс рендера завершился' } as const;

const answerSchema = z.union([
  z.strictObject({ ready: z.literal(true) }),
  z.strictObject({ id: z.number().int(), html: z.string() }),
  z.strictObject({ id: z.number().int(), error: z.string() }),
]);

interface Waiting {
  resolve: (html: string) => void;
  reject: (error: Error) => void;
}

interface Running {
  child: ChildProcessByStdio<Writable, Readable, null>;
  ready: Promise<void>;
  failStart: (error: Error) => void;
  // Отпечатки модулей, которые этот процесс уже получил.
  sent: Set<string>;
}

function jsonOf(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

const hasExited = (running: Running): boolean => running.child.exitCode !== null || running.child.signalCode !== null;

/** Живой процесс рендера: ожидание ответов и перезапуск при ошибках обмена. */
class Renderer implements SectionRenderer {
  private readonly waiting = new Map<number, Waiting>();
  private running: Running | null = null;
  private nextId = 1;

  constructor(private readonly workerPath?: string) {}

  render = (request: SectionRenderRequest): Promise<string> => {
    this.running ??= this.startWorker();
    const current = this.running;
    return this.ask(current, request);
  };

  pid = (): number | null => this.running?.child.pid ?? null;

  close = async (): Promise<void> => {
    const current = this.running;
    if (current === null) return;
    const exited = hasExited(current)
      ? Promise.resolve()
      : new Promise<void>((resolve) => current.child.once('exit', () => resolve()));
    this.stop(TEXT.exited);
    await exited;
  };

  private async ask(current: Running, request: SectionRenderRequest): Promise<string> {
    await current.ready;
    if (this.running !== current) throw new Error(TEXT.exited);
    const id = this.nextId++;
    const message = {
      id,
      hash: request.hash,
      settings: request.settings,
      ...(current.sent.has(request.hash) ? {} : { module: request.module }),
    };
    current.sent.add(request.hash);
    return new Promise<string>((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      current.child.stdin.write(`${JSON.stringify(message)}\n`);
    });
  }

  private stop(reason: string): void {
    const current = this.running;
    this.running = null;
    if (current === null) return;
    current.child.kill('SIGKILL');
    current.failStart(new Error(reason));
    for (const entry of this.waiting.values()) entry.reject(new Error(reason));
    this.waiting.clear();
  }

  private onLine(current: Running, line: string, markReady: () => void): void {
    const parsed = answerSchema.safeParse(jsonOf(line));
    if (!parsed.success) return this.stop(TEXT.shape);
    const answer = parsed.data;
    if ('ready' in answer) return markReady();
    const entry = this.waiting.get(answer.id);
    if (entry === undefined || this.running !== current) return this.stop(TEXT.shape);
    this.waiting.delete(answer.id);
    if ('html' in answer) entry.resolve(answer.html);
    else entry.reject(new Error(answer.error));
  }

  private startWorker(): Running {
    const child = spawn(process.execPath, ['--import', 'tsx', this.workerPath ?? WORKER], {
      cwd: PACKAGE_DIR,
      env: {},
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    // Резолверы готовности — в объекте: их видят и промис, и обёртка после него.
    const holders: { markReady?: () => void; rejectStart?: (error: Error) => void } = {};
    const ready = new Promise<void>((resolve, reject) => {
      holders.markReady = resolve;
      holders.rejectStart = reject;
    });
    ready.catch(() => undefined);
    const current: Running = {
      child,
      ready,
      failStart: (error: Error) => holders.rejectStart?.(error),
      sent: new Set(),
    };
    child.stdin.on('error', () => undefined);
    createInterface({ input: child.stdout }).on('line', (line) => this.onLine(current, line, () => holders.markReady?.()));
    child.on('exit', () => {
      if (this.running === current) this.stop(TEXT.exited);
    });
    return current;
  }
}

export function startSectionRenderer(options: RendererOptions = {}): SectionRenderer {
  return new Renderer(options.workerPath);
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
