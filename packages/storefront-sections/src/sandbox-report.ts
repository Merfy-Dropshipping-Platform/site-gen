import { text } from 'node:stream/consumers';
import { z } from 'zod';
import { defaultLaunch, spawnIsolated, type IsolatedLaunch } from './isolation';
import { RENDER_LIMITS } from './render';
import { WORKER_FILES } from './worker-files';

// Что закрыто у процессов рендера на этой машине (блок 2 «Секций и SDK»): проба (sandbox-probe.ts) с теми же правами,
// бинарником и пользователем, что у процесса рендера. Сборщик пишет отчёт строкой журнала render-sandbox при старте —
// по ней проверяют песочницу на сервере после выкатки. На сервере ждём: env 0, всё closed, user separate.
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
  uid: z.number().int().nullable(),
});

export type SandboxReport = Omit<z.infer<typeof probeSchema>, 'uid'> & {
  // separate — процесс рендера идёт от другого пользователя ОС, чем сборщик; same — от того же.
  user: 'separate' | 'same';
  // От запуска процесса до ответа, мс.
  startMs: number;
};

const ownUid = (): number | null => (typeof process.getuid === 'function' ? process.getuid() : null);

export async function sandboxReport(launch: IsolatedLaunch = defaultLaunch()): Promise<SandboxReport> {
  const startedAt = performance.now();
  const spec = { script: WORKER_FILES.probe, memoryMb: RENDER_LIMITS.memoryMb };
  const child = spawnIsolated(spec, launch, ['ignore', 'pipe', 'ignore']);
  const stdout = child.stdout === null ? '' : await text(child.stdout);
  const { uid, ...probe } = probeSchema.parse(JSON.parse(stdout));
  const startMs = Math.round(performance.now() - startedAt);
  return { ...probe, user: uid !== null && uid !== ownUid() ? 'separate' : 'same', startMs };
}
