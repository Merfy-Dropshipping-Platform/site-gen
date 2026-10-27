import { sampleRecordValues } from '@merfy/storefront-build';
import { defaultLaunch, spawnIsolated, type IsolatedLaunch } from './isolation';
import { prepareResultSchema, type PrepareInput, type PrepareResult } from './prepare';
import { problem } from './problems';
import { resolveSectionBlocks } from './blocks';
import { sectionMenus } from './menus';
import { settingFieldsOf } from './fields';
import { sectionRecordKeys } from './section-data';
import { defaultSettings, emptySettings } from './settings';
import { emptyTrialRender, sampleTrialRender, trialRender } from './trial';
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
  const fields = settingFieldsOf(result.section.manifest.settings);
  const settings = defaultSettings(fields);
  // Блоки новой секции (defaultBlocks): шаблон с blocks.map проверяется на них.
  const { blocks } = resolveSectionBlocks(result.section.manifest, undefined);
  // Меню новой секции (часть 4): у настроек вида menu — пустое дерево; theme и shop — пустые (процесс рендера).
  const menus = sectionMenus(fields, settings, []);
  const trial = await trialRender(result.section.render, settings, { launch: options.launch }, blocks, menus);
  if (trial.length > 0) return { ok: false, problems: trial };
  // Второй пробный рендер — с пустыми значениями (блок 3 «Секций и SDK», Р3.11): мерчант может стереть заголовок.
  const empty = emptySettings(fields);
  const emptyMenus = sectionMenus(fields, empty, []);
  const blank = await emptyTrialRender(result.section.render, empty, { launch: options.launch }, emptyMenus);
  if (blank.length > 0) return { ok: false, problems: blank };
  // Третий пробный рендер — на примерах данных магазина: ветки с ценой и карточками при умолчаниях не выполняются.
  // Блоки и меню — как в первом.
  const records = sampleRecordValues(sectionRecordKeys(result.section.manifest).recordFields);
  const sample = { launch: options.launch };
  const sampled = await sampleTrialRender(result.section.render, settings, { records }, sample, blocks, menus);
  return sampled.length > 0 ? { ok: false, problems: sampled } : result;
}
