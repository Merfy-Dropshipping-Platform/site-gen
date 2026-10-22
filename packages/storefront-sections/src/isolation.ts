import { spawn, type ChildProcess, type StdioOptions } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Процессы с чужим кодом секций (блок 2 «Секций и SDK», «Решил сам» пп. 1, 2, 5): процесс рендера и процесс проверки.
// Права — моделью разрешений Node: читать можно только папку собранного файла процесса и зависимости пакета; сети
// (на Node 26), дочерних процессов, аддонов, потоков и записи файлов нет; окружение пустое — секретов сборщика у процесса
// нет. На сервере процесс идёт от своего пользователя ОС: процесс рендера с тем же пользователем, что у сборщика,
// открыл бы у сборщика инспектор (process._debugProcess) или убил бы его сигналом. Инспектор по сигналу у самого
// процесса выключен (--disable-sigusr1): соседний процесс того же пользователя его не откроет. Бинарник Node
// и пользователь — из SECTION_RENDER_NODE, SECTION_RENDER_UID и SECTION_RENDER_GID окружения процесса (их задаёт
// Dockerfile сборщика); переменных нет — Node и пользователь вызывающего процесса (тесты, ноутбук).
export interface IsolatedLaunch {
  node: string;
  user: { uid: number; gid: number } | null;
}

export const launchEnvSchema = z.object({
  SECTION_RENDER_NODE: z.string().min(1).optional(),
  SECTION_RENDER_UID: z.coerce.number().int().nonnegative().optional(),
  SECTION_RENDER_GID: z.coerce.number().int().nonnegative().optional(),
});
export type LaunchEnv = z.infer<typeof launchEnvSchema>;

// Пользователь — обе переменные или ни одной.
export function launchOf(env: LaunchEnv): IsolatedLaunch {
  const { SECTION_RENDER_UID: uid, SECTION_RENDER_GID: gid } = env;
  if ((uid === undefined) !== (gid === undefined))
    throw new Error('SECTION_RENDER_UID и SECTION_RENDER_GID задаются вместе');
  const user = uid === undefined || gid === undefined ? null : { uid, gid };
  return { node: env.SECTION_RENDER_NODE ?? process.execPath, user };
}

export const readLaunch = (env: NodeJS.ProcessEnv): IsolatedLaunch => launchOf(launchEnvSchema.parse(env));

let fromEnv: IsolatedLaunch | null = null;

// Запуск по умолчанию — из окружения этого процесса, один раз.
export const defaultLaunch = (): IsolatedLaunch => (fromEnv ??= readLaunch(process.env));

export interface IsolatedProcess {
  // Собранный файл процесса: dist-render/*.mjs (build-workers.ts) или подставной процесс теста.
  script: string;
  memoryMb: number;
  // WASI — только процессу проверки: он компилирует шаблон, но чужой JS не исполняет (п. 5).
  wasi?: boolean;
}

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const NODE_MODULES = `${sep}node_modules${sep}`;

// Хранилище pnpm, куда ведут ссылки node_modules пакета: путь к astro до первого node_modules включительно.
function storeDir(): string {
  const astro = realpathSync(createRequire(join(PACKAGE_DIR, 'package.json')).resolve('astro/package.json'));
  return astro.slice(0, astro.indexOf(NODE_MODULES) + NODE_MODULES.length - 1);
}

// Папки для чтения: папка файла процесса, node_modules пакета (ссылки) и хранилище pnpm. Пути — настоящие (realpath):
// разрешение Node сверяет путь после ссылок.
export function readableDirs(script: string): string[] {
  const dirs = [dirname(realpathSync(script)), realpathSync(join(PACKAGE_DIR, 'node_modules')), storeDir()];
  return [...new Set(dirs)];
}

export function isolatedArgs(spec: IsolatedProcess): string[] {
  return [
    '--permission',
    '--disable-sigusr1',
    ...readableDirs(spec.script).map((dir) => `--allow-fs-read=${dir}`),
    ...(spec.wasi === true ? ['--allow-wasi'] : []),
    `--max-old-space-size=${spec.memoryMb}`,
    spec.script,
  ];
}

export function spawnIsolated(spec: IsolatedProcess, launch: IsolatedLaunch, stdio: StdioOptions): ChildProcess {
  return spawn(launch.node, isolatedArgs(spec), {
    cwd: dirname(spec.script),
    env: {},
    stdio,
    ...(launch.user ?? {}),
  });
}
