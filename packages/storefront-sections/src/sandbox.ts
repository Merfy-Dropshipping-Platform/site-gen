import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareResultSchema, type PrepareInput, type PrepareResult } from './prepare';
import { problem } from './problems';

// Отдельный процесс для приёма (design.md блока 7, С7-11 А: код любого автора проверяет и собирает sites). Чужой код
// собирается не в процессе сборщика: у процесса свои пределы времени и памяти и пустое окружение — ни адреса базы, ни
// ключей хранилища; GOMEMLIMIT — предел памяти для esbuild (он на Go). Пределы — допущение плана: 10 с и 256 МБ.
// Время вышло — процесс убит, отказ build-timeout; упал или ответил не по форме — build-crashed.
export interface SandboxOptions {
  timeoutMs: number;
  memoryMb: number;
  // Другой процесс вместо worker.ts — только для тестов сбоя.
  workerPath?: string;
}

export const DEFAULT_SANDBOX: SandboxOptions = { timeoutMs: 10_000, memoryMb: 256 };
const WORKER = fileURLToPath(new URL('./worker.ts', import.meta.url));
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));

interface WorkerExit {
  code: number | null;
  stdout: string;
  timedOut: boolean;
}

function runWorker(input: string, options: SandboxOptions): Promise<WorkerExit> {
  return new Promise((resolve) => {
    const args = [`--max-old-space-size=${options.memoryMb}`, '--import', 'tsx', options.workerPath ?? WORKER];
    const child = spawn(process.execPath, args, {
      cwd: PACKAGE_DIR,
      env: { GOMEMLIMIT: `${options.memoryMb}MiB` },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let stdout = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs);
    const finish = (code: number | null): void => {
      clearTimeout(timer);
      resolve({ code, stdout, timedOut });
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (stdout += chunk));
    child.stdin.on('error', () => undefined);
    child.on('error', () => finish(null));
    child.on('close', (code) => finish(code));
    child.stdin.end(input);
  });
}

const crashed = (message: string): PrepareResult => ({ ok: false, problems: [problem('build-crashed', '', message)] });

function parseOutput(stdout: string): PrepareResult {
  try {
    const value: unknown = JSON.parse(stdout.trim().split('\n').at(-1) ?? '');
    const parsed = prepareResultSchema.safeParse(value);
    return parsed.success ? parsed.data : crashed('процесс сборки ответил не по форме');
  } catch {
    return crashed('процесс сборки ответил не JSON');
  }
}

export async function prepareInWorker(
  input: PrepareInput,
  options: SandboxOptions = DEFAULT_SANDBOX,
): Promise<PrepareResult> {
  const exit = await runWorker(JSON.stringify(input), options);
  if (exit.timedOut)
    return { ok: false, problems: [problem('build-timeout', '', `сборка дольше ${options.timeoutMs} мс`)] };
  if (exit.code !== 0) return crashed(`процесс сборки завершился с кодом ${String(exit.code)}`);
  return parseOutput(exit.stdout);
}
