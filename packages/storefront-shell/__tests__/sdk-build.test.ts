// @vitest-environment node
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { CORE_BUDGET_BYTES } from '../build/build';
import { buildCore } from '../build/core';

// Ядро секций на Nano Stores (блок 9, часть 9а, Р9а-16): библиотека Nano Stores входит в core.js целиком, проверка
// process.env.NODE_ENV из её исходников подставлена сборкой. Бюджет страницы без секций — 16 КБ brotli (решение
// владельца 25.10, поправка к Р9а-16 после корзины блока 10; 15ж — вход по коду вне ядра, замер 26.10: 16 243 Б).
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../dist-test/sdk-build', import.meta.url));

afterAll(async () => {
  await rm(OUT_DIR, { recursive: true, force: true });
});

describe('ядро секций на Nano Stores', () => {
  it('в core.js нет process и импорта nanostores; бандл страницы без секций — до 16 КБ brotli', async () => {
    const manifest = await buildCore({
      packageDir: PACKAGE_DIR,
      outDir: OUT_DIR,
      core: ['cart', 'consent', 'customer', 'favorites'],
      version: '0.0.0-test',
    });
    const code = await readFile(join(OUT_DIR, 'core.js'), 'utf8');
    expect(code).not.toMatch(/\bprocess\./);
    expect(code).not.toMatch(/from\s*["']nanostores/);
    expect(CORE_BUDGET_BYTES).toBe(16 * 1024);
    expect(manifest.brotliBytes).toBeLessThanOrEqual(CORE_BUDGET_BYTES);
  });
});
