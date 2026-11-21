import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Запуск Node-инструментов дизайна подпроцессом: срок, kill всей группы, JSON из stdout, сеть только фильтром.
// - Окружение собирается с нуля: ключи и адреса процесса (RABBITMQ_URL, SITES_SERVICE_URL) в чужой пакет не идут.
// - Сеть: HTTP(S)_PROXY = наш фильтр и NODE_USE_ENV_PROXY=1, плюс `node/netguard.mjs` до кода пакета — любое соединение,
//   кроме фильтра и CDP на 127.0.0.1, отказ.
// - PLAYWRIGHT_BROWSERS_PATH — пустая папка: свой браузер пакет не запустит и не скачает, только наш по CDP.
// - Процесс в своей группе: по сроку убивается вся группа (SIGKILL). HOME и TMPDIR — временная папка на запуск.
// Образец — прототип Визи `vizi/design/node.py`.

export const NETGUARD = fileURLToPath(new URL('./node/netguard.mjs', import.meta.url));
// Флаги Node до скрипта инструмента. UNDICI-EHPA: Node 22 (CI, стенд на машине с Node 22) на NODE_USE_ENV_PROXY=1
// печатает в stderr «EnvHttpProxyAgent is experimental», и причина отказа инструмента тонула в этом шуме; Node 24
// (образ проверяющего) его не печатает. Остальные предупреждения пакета остаются в stderr.
export const NODE_FLAGS = ['--disable-warning=UNDICI-EHPA', '--import', NETGUARD];
const ERROR_CHARS = 400;
const STDOUT_LIMIT = 48 * 1024 * 1024;

export class NodeFailed extends Error {
  constructor(
    message: string,
    readonly timedOut = false,
  ) {
    super(message);
    this.name = 'NodeFailed';
  }
}

export interface NodeRun {
  script: string;
  args: string[];
  // Адрес нашего фильтра и CDP (http://127.0.0.1:<порт>).
  proxy: string;
  cdp: string;
  timeoutMs: number;
  env?: Record<string, string>;
  node?: string;
}

// `http://127.0.0.1:9223` → `127.0.0.1:9223` — строка списка разрешённых адресов.
export const loopbackKey = (url: string): string => {
  const parsed = new URL(url);
  return `${parsed.hostname}:${parsed.port}`;
};

export function nodeEnv(run: NodeRun, home: string): Record<string, string> {
  return {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: home,
    TMPDIR: home,
    HTTP_PROXY: run.proxy,
    HTTPS_PROXY: run.proxy,
    NO_PROXY: '127.0.0.1,localhost',
    NODE_USE_ENV_PROXY: '1',
    DESIGN_NET_ALLOW: [run.proxy, run.cdp].map(loopbackKey).join(','),
    PLAYWRIGHT_BROWSERS_PATH: join(home, 'no-browsers'),
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    NO_COLOR: '1',
    CI: '1',
    ...run.env,
  };
}

// Первый JSON-объект в stdout: пакеты иногда печатают строку до него.
export function parseJson(stdout: string): unknown {
  const start = stdout.indexOf('{');
  if (start < 0) throw new NodeFailed('инструмент не напечатал JSON');
  try {
    return JSON.parse(stdout.slice(start));
  } catch (error) {
    throw new NodeFailed(`ответ инструмента не JSON: ${String(error).slice(0, 200)}`);
  }
}

interface Finished {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function killGroup(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // группы уже нет
  }
}

// Вывод процесса с пределом: stdout дальше STDOUT_LIMIT отбрасывается (ответ всё равно не разберётся).
class Output {
  private readonly chunks: Buffer[] = [];
  private size = 0;

  constructor(private readonly limit: number) {}

  push = (chunk: Buffer): void => {
    this.size += chunk.length;
    if (this.size <= this.limit) this.chunks.push(chunk);
  };

  text = (): string => Buffer.concat(this.chunks).toString('utf8');
}

function collect(run: NodeRun, home: string): Promise<Finished> {
  return new Promise((resolve) => {
    const child = spawn(run.node ?? process.execPath, [...NODE_FLAGS, run.script, ...run.args], {
      env: nodeEnv(run, home),
      cwd: home,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const [out, err] = [new Output(STDOUT_LIMIT), new Output(STDOUT_LIMIT)];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child.pid);
    }, run.timeoutMs);
    child.stdout.on('data', out.push);
    child.stderr.on('data', err.push);
    child.once('error', (error) => resolve({ code: -1, stdout: '', stderr: String(error), timedOut: false }));
    child.once('close', (code: number | null) => {
      clearTimeout(timer);
      killGroup(child.pid);
      resolve({ code, stdout: out.text(), stderr: err.text(), timedOut });
    });
  });
}

// Запустить и вернуть разобранный JSON. Любая неудача — NodeFailed с причиной.
export async function runNode(run: NodeRun): Promise<unknown> {
  const home = await mkdtemp(join(tmpdir(), 'merfy-design-'));
  try {
    const finished = await collect(run, home);
    if (finished.timedOut) throw new NodeFailed(`инструмент не уложился в ${Math.round(run.timeoutMs / 1000)} с`, true);
    if (finished.code !== 0 && !finished.stdout.includes('{')) {
      throw new NodeFailed(`инструмент вышел с кодом ${finished.code}: ${finished.stderr.trim().slice(-ERROR_CHARS)}`);
    }
    return parseJson(finished.stdout);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}
