import { describe, expect, it } from 'vitest';
import { isolatedArgs, readLaunch } from '../src/isolation';
import { WORKER_FILES } from '../src/worker-files';

describe('запуск процессов с чужим кодом', () => {
  it('бинарник Node и пользователь — из окружения; пользователь — обе переменные или ни одной', () => {
    expect(readLaunch({})).toEqual({ node: process.execPath, user: null });
    expect(
      readLaunch({
        SECTION_RENDER_NODE: '/usr/local/bin/node26',
        SECTION_RENDER_UID: '10001',
        SECTION_RENDER_GID: '10001',
      }),
    ).toEqual({
      node: '/usr/local/bin/node26',
      user: { uid: 10001, gid: 10001 },
    });
    expect(() => readLaunch({ SECTION_RENDER_UID: '10001' })).toThrow(
      'SECTION_RENDER_UID и SECTION_RENDER_GID задаются вместе',
    );
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
