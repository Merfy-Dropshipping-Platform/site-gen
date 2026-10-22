import { defaultLaunch, spawnIsolated, type IsolatedLaunch } from './isolation';
import { prepareResultSchema, type PrepareInput, type PrepareResult } from './prepare';
import { problem } from './problems';
import { defaultSettings } from './settings';
import { trialRender } from './trial';
import { WORKER_FILES } from './worker-files';

// Отдельный процесс для приёма (design.md блока 7, С7-11 А: код любого автора проверяет и собирает sites). Чужой код
// собирается не в процессе сборщика: у процесса свои пределы времени и памяти, пустое окружение и права isolation.ts
// (блок 2 «Секций и SDK», «Решил сам» п. 5). Компилятор шаблона здесь — WASI, esbuild — WebAssembly: аддонов и
// дочерних процессов у процесса нет, есть только WASI — его не получает процесс рендера. Чужой JS процесс не исполняет:
// пробный рендер — после проверки, в процессе рендера (trial.ts). Пределы — допущение плана: 10 с и 256 МБ. Время
// вышло — процесс убит, отказ build-timeout; упал или ответил не по форме — build-crashed.
export interface SandboxOptions {
  timeoutMs: number;
  memoryMb: number;
  // Другой процесс вместо check-worker — только для тестов сбоя.
  workerPath?: string;
  // Бинарник Node и пользователь ОС процессов проверки и пробного рендера; нет — как у вызывающего процесса.
  launch?: IsolatedLaunch;
}

export const DEFAULT_SANDBOX: SandboxOptions = { timeoutMs: 10_000, memoryMb: 256 };

interface WorkerExit {
  code: number | null;
  stdout: string;
  timedOut: boolean;
}

function runWorker(input: string, options: SandboxOptions): Promise<WorkerExit> {
  return new Promise((resolve) => {
    const spec = { script: options.workerPath ?? WORKER_FILES.check, memoryMb: options.memoryMb, wasi: true };
    const child = spawnIsolated(spec, options.launch ?? defaultLaunch(), ['pipe', 'pipe', 'ignore']);
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
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => (stdout += chunk));
    child.stdin?.on('error', () => undefined);
    child.on('error', () => finish(null));
    child.on('close', (code) => finish(code));
    child.stdin?.end(input);
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
  const result = parseOutput(exit.stdout);
  if (!result.ok || result.section.render === null) return result;
  // Пробный рендер — только когда всё остальное прошло: модуль без проблем, поля настроек верные.
  const settings = defaultSettings(result.section.manifest.settings);
  const trial = await trialRender(result.section.render, settings, { launch: options.launch });
  return trial.length > 0 ? { ok: false, problems: trial } : result;
}
