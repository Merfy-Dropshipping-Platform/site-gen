import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isolatedArgs, readLaunch, spawnIsolated, UserPool } from '../src/isolation';
import { WORKER_FILES } from '../src/worker-files';

const WORKERS = fileURLToPath(new URL('../fixtures/workers/', import.meta.url));
const EXIT = join(WORKERS, 'exit.mjs');
// Свой uid и своя группа: от них процесс запускается и без root (тесты, CI).
const uid = process.getuid?.() ?? 0;
const gid = process.getgid?.() ?? 0;

const closed = (child: ReturnType<typeof spawnIsolated>): Promise<void> =>
  new Promise((resolve) => child.once('close', () => resolve()));

describe('запуск процессов с чужим кодом', () => {
  it('бинарник Node и пользователи — из окружения; пользователи — все три переменные или ни одной', () => {
    expect(readLaunch({})).toEqual({ node: process.execPath, users: null });
    const launch = readLaunch({
      SECTION_RENDER_NODE: '/usr/local/bin/node26',
      SECTION_RENDER_UID_FIRST: '10001',
      SECTION_RENDER_UID_COUNT: '1000',
      SECTION_RENDER_GID: '10001',
    });
    expect(launch.node).toBe('/usr/local/bin/node26');
    expect(launch.users).toMatchObject({ first: 10001, count: 1000, gid: 10001 });
    expect(() => readLaunch({ SECTION_RENDER_UID_FIRST: '10001', SECTION_RENDER_GID: '10001' })).toThrow(
      'SECTION_RENDER_UID_FIRST, SECTION_RENDER_UID_COUNT и SECTION_RENDER_GID задаются вместе',
    );
    expect(() =>
      readLaunch({ SECTION_RENDER_UID_FIRST: '0', SECTION_RENDER_UID_COUNT: '1', SECTION_RENDER_GID: '0' }),
    ).toThrow();
  });

  it('у каждого живого процесса свой uid; освободившийся выдаётся как можно позже; все заняты — ошибка', () => {
    const pool = new UserPool(10001, 3, 10001);
    expect([pool.take(), pool.take(), pool.take()]).toEqual([
      { uid: 10001, gid: 10001 },
      { uid: 10002, gid: 10001 },
      { uid: 10003, gid: 10001 },
    ]);
    expect(() => pool.take()).toThrow('все 3 пользователей процессов секций заняты');
    pool.release(10002);
    expect(pool.take().uid).toBe(10002);
    pool.release(10001);
    pool.release(10003);
    expect(pool.take().uid).toBe(10003);
    expect(pool.take().uid).toBe(10001);
  });

  it('uid занят, пока процесс жив, и свободен после выхода', async () => {
    const pool = new UserPool(uid, 1, gid);
    const child = spawnIsolated({ script: EXIT, memoryMb: 64 }, { node: process.execPath, users: pool }, 'ignore');
    expect(() => pool.take()).toThrow('все 1 пользователей процессов секций заняты');
    await closed(child);
    expect(pool.take()).toEqual({ uid, gid });
  });

  it('процесс не запустился — uid свободен', async () => {
    const pool = new UserPool(uid, 1, gid);
    const launch = { node: process.execPath, users: pool };
    expect(() => spawnIsolated({ script: join(WORKERS, 'нет-файла.mjs'), memoryMb: 64 }, launch, 'ignore')).toThrow(
      'ENOENT',
    );
    const child = spawnIsolated({ script: EXIT, memoryMb: 64 }, { node: '/нет/node', users: pool }, 'ignore');
    child.once('error', () => undefined);
    await closed(child);
    expect(pool.take()).toEqual({ uid, gid });
  });

  it('права: --permission, без инспектора по сигналу, чтение — папка процесса и зависимости, WASI — по просьбе', () => {
    const args = isolatedArgs({ script: WORKER_FILES.render, memoryMb: 256 });
    expect(args.slice(0, 2)).toEqual(['--permission', '--disable-sigusr1']);
    expect(args.filter((arg) => arg.startsWith('--allow-'))).toHaveLength(3);
    expect(args.every((arg) => !/^--allow-(net|child-process|addons|worker|wasi|fs-write)/.test(arg))).toBe(true);
    expect(args.slice(-2)).toEqual(['--max-old-space-size=256', WORKER_FILES.render]);
    expect(isolatedArgs({ script: WORKER_FILES.check, memoryMb: 256, wasi: true })).toContain('--allow-wasi');
  });
});
