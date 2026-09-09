/**
 * Task 0 — reproducible pnpm invocation topology.
 *
 * `ThemeBuildService` historically spawned a BARE `pnpm`, which on the target
 * machine can resolve an incompatible global pnpm 7/9 even when the parent
 * command was launched through pinned `corepack pnpm exec` (F-048: corepack
 * exec does not reliably expose `npm_execpath`). We introduce a pure
 * `resolvePnpmInvocation(env)` helper with ONE explicit opt-in:
 *
 *   MERFY_PNPM_MODE=corepack  → command `corepack` + argument prefix `pnpm`
 *   unset                     → bare `pnpm` fallback (production Docker image,
 *                               which explicitly installs pnpm@10.14.0)
 *   anything else             → hard reject
 *
 * These tests prove: explicit corepack invocation, bare fallback,
 * invalid-mode failure, that the existing `--ignore-workspace`/`exec astro
 * build` arguments are preserved verbatim, and an integration child-process
 * run that actually goes through `corepack pnpm exec` WITH `npm_execpath`
 * absent, selects the explicit Corepack mode, and observes pnpm 10.14.0
 * rather than whatever global binary happens to be on PATH.
 */
import { spawnSync } from 'child_process';
import * as path from 'path';
import {
  resolvePnpmInvocation,
  PNPM_INSTALL_ARGS,
  PNPM_ASTRO_BUILD_ARGS,
  type PnpmInvocation,
} from '../pnpm-invocation';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

describe('resolvePnpmInvocation', () => {
  it('MERFY_PNPM_MODE=corepack → command "corepack" with argsPrefix ["pnpm"]', () => {
    const inv = resolvePnpmInvocation({ MERFY_PNPM_MODE: 'corepack' });
    expect(inv.command).toBe('corepack');
    expect(inv.argsPrefix).toEqual(['pnpm']);
  });

  it('unset mode → bare "pnpm" fallback with empty argsPrefix (production image)', () => {
    const inv = resolvePnpmInvocation({});
    expect(inv.command).toBe('pnpm');
    expect(inv.argsPrefix).toEqual([]);
  });

  it('empty-string mode is treated as unset → bare "pnpm" fallback', () => {
    const inv = resolvePnpmInvocation({ MERFY_PNPM_MODE: '' });
    expect(inv.command).toBe('pnpm');
    expect(inv.argsPrefix).toEqual([]);
  });

  it('rejects every other mode (no free-form executable from env)', () => {
    expect(() => resolvePnpmInvocation({ MERFY_PNPM_MODE: 'bare' })).toThrow(
      /MERFY_PNPM_MODE/,
    );
    expect(() =>
      resolvePnpmInvocation({ MERFY_PNPM_MODE: '/usr/local/bin/pnpm' }),
    ).toThrow(/MERFY_PNPM_MODE/);
    expect(() => resolvePnpmInvocation({ MERFY_PNPM_MODE: 'Corepack' })).toThrow(
      /MERFY_PNPM_MODE/,
    );
  });

  it('argsPrefix is a fresh array (callers may not mutate the helper state)', () => {
    const a = resolvePnpmInvocation({ MERFY_PNPM_MODE: 'corepack' });
    a.argsPrefix.push('MUTATED');
    const b = resolvePnpmInvocation({ MERFY_PNPM_MODE: 'corepack' });
    expect(b.argsPrefix).toEqual(['pnpm']);
  });

  it('preserves the exact existing theme install / astro build arguments', () => {
    // Behaviour-preserving: these are the argument lists ThemeBuildService
    // passed to bare `pnpm` before this task. They must not drift.
    expect(PNPM_INSTALL_ARGS).toEqual([
      'install',
      '--ignore-workspace',
      '--prefer-offline',
    ]);
    expect(PNPM_ASTRO_BUILD_ARGS).toEqual(['exec', 'astro', 'build']);
  });

  it('composes full argv = argsPrefix + subcommand args for both modes', () => {
    const corepack = resolvePnpmInvocation({ MERFY_PNPM_MODE: 'corepack' });
    expect([...corepack.argsPrefix, ...PNPM_INSTALL_ARGS]).toEqual([
      'pnpm',
      'install',
      '--ignore-workspace',
      '--prefer-offline',
    ]);
    expect([...corepack.argsPrefix, ...PNPM_ASTRO_BUILD_ARGS]).toEqual([
      'pnpm',
      'exec',
      'astro',
      'build',
    ]);

    const bare = resolvePnpmInvocation({});
    expect([...bare.argsPrefix, ...PNPM_INSTALL_ARGS]).toEqual([
      'install',
      '--ignore-workspace',
      '--prefer-offline',
    ]);
  });
});

describe('resolvePnpmInvocation integration (child-process through corepack)', () => {
  // The whole point of F-048: under `corepack pnpm exec`, npm_execpath is not a
  // reliable pointer to the pinned pnpm, so a bare `pnpm` spawn can drift to a
  // global binary. Here we reproduce that exec context (npm_execpath removed),
  // resolve the explicit corepack mode, spawn `<command> <...argsPrefix> --version`
  // and assert the pinned 10.14.0 is what actually runs.
  it('explicit corepack mode runs pinned pnpm 10.14.0 even without npm_execpath', () => {
    const env: NodeJS.ProcessEnv = { ...process.env, MERFY_PNPM_MODE: 'corepack' };
    delete env.npm_execpath;
    delete env.npm_config_user_agent;

    const inv: PnpmInvocation = resolvePnpmInvocation(env);
    expect(inv.command).toBe('corepack');

    const res = spawnSync(inv.command, [...inv.argsPrefix, '--version'], {
      cwd: REPO_ROOT,
      env,
      encoding: 'utf-8',
      timeout: 120_000,
    });

    expect(res.error).toBeUndefined();
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe('10.14.0');
  }, 120_000);
});
