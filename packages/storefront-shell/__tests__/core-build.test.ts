// @vitest-environment node
import { readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CORE_BUDGET_BYTES } from '../build/build';
import { buildCore } from '../build/core';

// Сборка ядра секций (design.md блока 5, раздел 3.10): ESM-библиотека dist/core.js — start, defineSection и части
// отдельными экспортами, без splitting и без запуска при загрузке. Бюджет 8 КБ brotli — на бандле страницы без секций
// с частями из core-parts.json. esbuild в среде jsdom не работает — файл идёт в среде node. Выход — в dist-test пакета:
// там package.json с "type": "module", и Node загружает core.js как модуль.
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const OUT_ROOT = fileURLToPath(new URL('../dist-test/core-build', import.meta.url));
const ALL_PARTS = ['auth', 'cart', 'consent', 'favorites'] as const;

beforeAll(async () => {
  await rm(OUT_ROOT, { recursive: true, force: true });
});

afterAll(async () => {
  await rm(OUT_ROOT, { recursive: true, force: true });
});

describe('сборка ядра секций', () => {
  it('dist/core.js и core.json: вес в бюджете, без import() и zod', async () => {
    const outDir = join(OUT_ROOT, 'full');
    const manifest = await buildCore({ packageDir: PACKAGE_DIR, outDir, core: ALL_PARTS, version: '0.1.0' });
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.brotliBytes).toBeGreaterThan(0);
    // Части страницы — в core.json: их читает сборка магазина (storefront-build/src/shell.ts).
    expect(manifest.parts).toEqual(['auth', 'cart', 'consent', 'favorites']);
    expect(manifest.brotliBytes).toBeLessThanOrEqual(CORE_BUDGET_BYTES);
    expect((await readdir(outDir)).sort()).toEqual(['core.js', 'core.json']);
    const written: unknown = JSON.parse(await readFile(join(outDir, 'core.json'), 'utf8'));
    expect(written).toEqual(manifest);
    const code = await readFile(join(outDir, 'core.js'), 'utf8');
    expect(code).not.toContain('import(');
    expect(code).not.toContain('ZodError');
  });

  it('загрузка файла ничего не запускает и отдаёт start, defineSection и части', async () => {
    const outDir = join(OUT_ROOT, 'exports');
    await buildCore({ packageDir: PACKAGE_DIR, outDir, core: ALL_PARTS, version: '0.1.0' });
    const module: unknown = await import(pathToFileURL(join(outDir, 'core.js')).href);
    const names = typeof module === 'object' && module !== null ? Object.keys(module) : [];
    expect(names).toEqual(expect.arrayContaining(['auth', 'cart', 'defineSection', 'favorites', 'start']));
  });

  it('тяжелее бюджета — core-too-heavy, файлы не пишутся', async () => {
    const outDir = join(OUT_ROOT, 'heavy');
    const options = { packageDir: PACKAGE_DIR, outDir, core: ALL_PARTS, version: '0.1.0', budgetBytes: 100 };
    await expect(buildCore(options)).rejects.toMatchObject({ code: 'core-too-heavy' });
    await expect(readdir(outDir)).rejects.toThrow('ENOENT');
  });
});
