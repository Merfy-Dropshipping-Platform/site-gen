import type { ChildProcess } from 'node:child_process';
import { text } from 'node:stream/consumers';
import { z } from 'zod';
import { defaultLaunch, spawnIsolated, type IsolatedLaunch } from './isolation';
import { RENDER_LIMITS } from './render';
import { WORKER_FILES } from './worker-files';

// Что закрыто у процессов рендера на этой машине (блок 2 «Секций и SDK»): проба (sandbox-probe.ts) с теми же правами,
// бинарником и пользователями, что у процесса рендера, и соседний процесс рендера — ему проба пробует послать сигнал.
// Сборщик пишет отчёт строкой журнала render-sandbox при старте — по ней проверяют песочницу на сервере после выкатки.
// На сервере ждём: env 0, всё closed, user separate.
const doorSchema = z.enum(['closed', 'open']);
const probeSchema = z.strictObject({
  node: z.string(),
  env: z.number().int().nonnegative(),
  net: doorSchema,
  child: doorSchema,
  worker: doorSchema,
  write: doorSchema,
  read: doorSchema,
  inspector: doorSchema,
  wasi: doorSchema,
  // Сигнал соседнему процессу рендера (В2-3 А); missing — соседа нет, сигналы отчёт не проверил.
  neighbour: z.enum(['closed', 'open', 'missing']),
  uid: z.number().int().nullable(),
});

export type SandboxReport = Omit<z.infer<typeof probeSchema>, 'uid'> & {
  // separate — процесс рендера идёт от другого пользователя ОС, чем сборщик; same — от того же.
  user: 'separate' | 'same';
  // От запуска процесса до ответа, мс.
  startMs: number;
};

const ownUid = (): number | null => (typeof process.getuid === 'function' ? process.getuid() : null);

// Процесс не запустился (нет бинарника Node) — отказ отчёта: сборщик пишет render-sandbox-failed и работает дальше.
const spawnFailure = (child: ChildProcess): Promise<never> =>
  new Promise((_resolve, reject) => child.once('error', reject));

export async function sandboxReport(launch: IsolatedLaunch = defaultLaunch()): Promise<SandboxReport> {
  const startedAt = performance.now();
  const memoryMb = RENDER_LIMITS.memoryMb;
  // Сосед — процесс рендера без ключа и запросов: проба пробует послать ему сигнал, пока он запущен. Не запустился —
  // проба ответит neighbour: missing.
  const render = { script: WORKER_FILES.render, memoryMb };
  const neighbour = spawnIsolated(render, launch, ['pipe', 'ignore', 'ignore', 'pipe']);
  neighbour.once('error', () => undefined);
  try {
    const child = spawnIsolated({ script: WORKER_FILES.probe, memoryMb }, launch, ['pipe', 'pipe', 'ignore']);
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(`${neighbour.pid ?? ''}\n`);
    const stdout = await Promise.race([child.stdout === null ? '' : text(child.stdout), spawnFailure(child)]);
    const { uid, ...probe } = probeSchema.parse(JSON.parse(stdout));
    const startMs = Math.round(performance.now() - startedAt);
    return { ...probe, user: uid !== null && uid !== ownUid() ? 'separate' : 'same', startMs };
  } finally {
    neighbour.kill('SIGKILL');
  }
}
