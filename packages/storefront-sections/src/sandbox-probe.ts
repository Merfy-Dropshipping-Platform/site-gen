import { spawnSync } from 'node:child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { Session } from 'node:inspector';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WASI } from 'node:wasi';
import { Worker } from 'node:worker_threads';

// Проба песочницы (блок 2 «Секций и SDK»): процесс с правами процесса рендера пробует то, что секции нельзя, и печатает
// одну строку JSON — что закрыто. closed — Node отказал с ERR_ACCESS_DENIED; open — получилось или отказ другой
// (например, сеть на Node 24: ECONNREFUSED вместо ERR_ACCESS_DENIED). Порт сети — не из списка запрещённых fetch (9 и
// другие fetch отклоняет сам, «bad port»). Её запускает sandbox-report.ts.
type Door = 'closed' | 'open';

function codeOf(error: unknown): unknown {
  const cause: unknown = Reflect.get(Object(error), 'cause');
  return Reflect.get(Object(error), 'code') ?? Reflect.get(Object(cause), 'code');
}

function attempt(work: () => unknown): Door {
  try {
    work();
    return 'open';
  } catch (error) {
    return codeOf(error) === 'ERR_ACCESS_DENIED' ? 'closed' : 'open';
  }
}

async function attemptAsync(work: () => Promise<unknown>): Promise<Door> {
  try {
    await work();
    return 'open';
  } catch (error) {
    return codeOf(error) === 'ERR_ACCESS_DENIED' ? 'closed' : 'open';
  }
}

const PROBE_FILE = join(tmpdir(), `merfy-sandbox-probe-${process.pid}`);

const report = {
  node: process.versions.node,
  env: Object.keys(process.env).length,
  net: await attemptAsync(() => fetch('http://127.0.0.1:65535/')),
  child: attempt(() => spawnSync('true')),
  worker: attempt(() => new Worker('0', { eval: true })),
  write: attempt(() => {
    writeFileSync(PROBE_FILE, '1');
    unlinkSync(PROBE_FILE);
  }),
  read: attempt(() => readFileSync('/etc/hosts')),
  inspector: attempt(() => {
    const session = new Session();
    session.connect();
    session.disconnect();
  }),
  wasi: attempt(() => new WASI({ version: 'preview1' })),
  uid: typeof process.getuid === 'function' ? process.getuid() : null,
};
process.stdout.write(`${JSON.stringify(report)}\n`);
