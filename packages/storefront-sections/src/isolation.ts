import { spawn, type ChildProcess, type StdioOptions } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Процессы с чужим кодом секций (блок 2 «Секций и SDK», «Решил сам» пп. 1, 2, 5): процесс рендера и процесс проверки.
// Права — моделью разрешений Node: читать можно только папку собранного файла процесса и зависимости пакета; сети
// (на Node 26), дочерних процессов, аддонов, потоков и записи файлов нет; окружение пустое — секретов сборщика у процесса
// нет. На сервере у каждого процесса свой пользователь ОС (В2-3 А): процесс рендера с тем же пользователем, что у
// сборщика, открыл бы у сборщика инспектор (process._debugProcess) или убил бы его сигналом, а с тем же, что у соседнего
// процесса рендера, остановил бы соседа (SIGSTOP) — секции другого магазина пропали бы с витрины. Инспектор по сигналу у
// самого процесса выключен (--disable-sigusr1). Бинарник Node и пользователи — из SECTION_RENDER_NODE,
// SECTION_RENDER_UID_FIRST, SECTION_RENDER_UID_COUNT и SECTION_RENDER_GID окружения процесса (их задаёт Dockerfile
// сборщика); переменных нет — Node и пользователь вызывающего процесса (тесты, ноутбук).
export interface IsolatedLaunch {
  node: string;
  users: UserPool | null;
}

// Пользователи ОС процессов: uid first … first + count − 1, у каждого живого процесса — свой, группа у всех одна.
// Сигнал чужому процессу ядро пропускает, только если uid отправителя и получателя совпадают (или отправитель — root),
// группа тут не участвует. Свободный uid ищется по кругу от следующего за последним выданным: освободившийся uid
// выдаётся новому процессу как можно позже. Все заняты — процесс не запускается (сбой процесса, ошибка без стадии).
export class UserPool {
  private readonly busy = new Set<number>();
  private next = 0;
  readonly first: number;
  readonly count: number;
  readonly gid: number;

  constructor(first: number, count: number, gid: number) {
    this.first = first;
    this.count = count;
    this.gid = gid;
  }

  take(): { uid: number; gid: number } {
    for (let step = 0; step < this.count; step += 1) {
      const offset = (this.next + step) % this.count;
      const uid = this.first + offset;
      if (!this.busy.has(uid)) {
        this.busy.add(uid);
        this.next = (offset + 1) % this.count;
        return { uid, gid: this.gid };
      }
    }
    throw new Error(`все ${this.count} пользователей процессов секций заняты`);
  }

  release(uid: number): void {
    this.busy.delete(uid);
  }
}

// uid 0 и группа 0 — root: процесс от них не отделён от сборщика, поэтому только положительные.
export const launchEnvSchema = z.object({
  SECTION_RENDER_NODE: z.string().min(1).optional(),
  SECTION_RENDER_UID_FIRST: z.coerce.number().int().positive().optional(),
  SECTION_RENDER_UID_COUNT: z.coerce.number().int().positive().optional(),
  SECTION_RENDER_GID: z.coerce.number().int().positive().optional(),
});
export type LaunchEnv = z.infer<typeof launchEnvSchema>;

// Пользователи — все три переменные или ни одной.
export function launchOf(env: LaunchEnv): IsolatedLaunch {
  const node = env.SECTION_RENDER_NODE ?? process.execPath;
  const { SECTION_RENDER_UID_FIRST: first, SECTION_RENDER_UID_COUNT: count, SECTION_RENDER_GID: gid } = env;
  if (first === undefined && count === undefined && gid === undefined) return { node, users: null };
  if (first === undefined || count === undefined || gid === undefined)
    throw new Error('SECTION_RENDER_UID_FIRST, SECTION_RENDER_UID_COUNT и SECTION_RENDER_GID задаются вместе');
  return { node, users: new UserPool(first, count, gid) };
}

export const readLaunch = (env: NodeJS.ProcessEnv): IsolatedLaunch => launchOf(launchEnvSchema.parse(env));

let fromEnv: IsolatedLaunch | null = null;

// Запуск по умолчанию — из окружения этого процесса, один раз: пул пользователей один на процесс.
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
  const options = { cwd: dirname(spec.script), env: {}, stdio };
  const { users } = launch;
  if (users === null) return spawn(launch.node, isolatedArgs(spec), options);
  const user = users.take();
  try {
    const child = spawn(launch.node, isolatedArgs(spec), { ...options, ...user });
    // uid свободен, когда процесс вышел и его потоки закрылись; close приходит и после error (процесс не запустился).
    child.once('close', () => users.release(user.uid));
    return child;
  } catch (error) {
    users.release(user.uid);
    throw error;
  }
}
