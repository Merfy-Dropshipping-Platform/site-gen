// @vitest-environment node
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Metafile } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CORE_BUDGET_BYTES, buildShell } from '../build/build';
import { preloadOf } from '../build/meta';

// esbuild в среде jsdom не работает — этот файл идёт в среде node.
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const ALL_PARTS = ['auth', 'cart', 'favorites'] as const;
let outRoot: string;

beforeAll(async () => {
  outRoot = await mkdtemp(join(tmpdir(), 'merfy-shell-'));
});

afterAll(async () => {
  await rm(outRoot, { recursive: true, force: true });
});

describe('сборка ядра', () => {
  it('всё ядро — один файл shell.js: подсказка одна, вес в бюджете, zod внутрь не попал', async () => {
    const outDir = join(outRoot, 'full');
    const manifest = await buildShell({ packageDir: PACKAGE_DIR, outDir, core: ALL_PARTS, version: '0.1.0' });
    expect(manifest.preload).toEqual(['shell.js']);
    expect(manifest.brotliBytes).toBeGreaterThan(0);
    expect(manifest.brotliBytes).toBeLessThanOrEqual(CORE_BUDGET_BYTES);
    expect(await readdir(join(outDir, 'shell'))).toEqual(['shell.js']);
    const written: unknown = JSON.parse(await readFile(join(outDir, 'shell.json'), 'utf8'));
    expect(written).toEqual(manifest);
    const code = await readFile(join(outDir, 'shell', 'shell.js'), 'utf8');
    expect(code).toContain('merfy-section');
    expect(code).not.toContain('ZodError');
  });

  it('части вне списка — отдельные файлы part-<hash>.js без подсказки modulepreload', async () => {
    const outDir = join(outRoot, 'cart-only');
    const manifest = await buildShell({ packageDir: PACKAGE_DIR, outDir, core: ['cart'], version: '0.1.0' });
    const files = await readdir(join(outDir, 'shell'));
    const lazy = files.filter((name) => !manifest.preload.includes(name));
    expect(manifest.preload[0]).toBe('shell.js');
    expect(lazy.length).toBeGreaterThanOrEqual(2);
    expect(lazy.every((name) => /^part-[A-Z0-9]{8}\.js$/.test(name))).toBe(true);
  });

  it('тяжелее бюджета — core-too-heavy, файлы не пишутся', async () => {
    const outDir = join(outRoot, 'heavy');
    const options = { packageDir: PACKAGE_DIR, outDir, core: ALL_PARTS, version: '0.1.0', budgetBytes: 100 };
    await expect(buildShell(options)).rejects.toMatchObject({ code: 'core-too-heavy' });
    await expect(readdir(outDir)).rejects.toThrow('ENOENT');
  });

  it('подсказки — файл ядра и его статические зависимости по цепочке, без import() и внешних', () => {
    const output = (imports: Metafile['outputs'][string]['imports']) => ({
      bytes: 1,
      inputs: {},
      exports: [],
      imports,
    });
    const metafile: Metafile = {
      inputs: {},
      outputs: {
        'dist/shell/shell.js': output([
          { path: 'dist/shell/part-AAAA1111.js', kind: 'import-statement' },
          { path: 'dist/shell/part-BBBB2222.js', kind: 'dynamic-import' },
          { path: '@merfy/other', kind: 'import-statement', external: true },
        ]),
        'dist/shell/part-AAAA1111.js': output([{ path: 'dist/shell/part-CCCC3333.js', kind: 'import-statement' }]),
        'dist/shell/part-BBBB2222.js': output([]),
        'dist/shell/part-CCCC3333.js': output([]),
      },
    };
    expect(preloadOf(metafile, 'shell.js')).toEqual(['shell.js', 'part-AAAA1111.js', 'part-CCCC3333.js']);
    expect(preloadOf(metafile, 'other.js')).toEqual([]);
  });
});
