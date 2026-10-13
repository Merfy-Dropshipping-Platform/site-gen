// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { brotliCompressSync } from 'node:zlib';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

// Вес модуля аналитики (design.md блока 11, решил сам 13): до 3 КБ brotli. Сборка — как у приёма секции (блок 7,
// packages/storefront-sections/src/script.ts): esm, es2022, minify, @merfy/shell — внешний. Бюджет стережёт этот тест
// в pnpm test пакета; CI site-gen его гоняет вместе с остальными тестами ядра.
const ENTRY = fileURLToPath(new URL('../sections/analytics/script.ts', import.meta.url));
const BUDGET_BYTES = 3 * 1024;

async function brotliBytes(): Promise<number> {
  const result = await build({
    entryPoints: [ENTRY],
    outfile: 'analytics.js',
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    write: false,
    external: ['@merfy/shell'],
    logLevel: 'silent',
  });
  return brotliCompressSync(result.outputFiles.map((file) => file.text).join('')).length;
}

describe('вес модуля аналитики', () => {
  it('до 3 КБ brotli', async () => {
    expect(await brotliBytes()).toBeLessThanOrEqual(BUDGET_BYTES);
  });
});
