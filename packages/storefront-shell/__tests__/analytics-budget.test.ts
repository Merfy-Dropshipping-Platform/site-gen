// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { brotliCompressSync } from 'node:zlib';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

// Вес модуля аналитики (design.md блока 11, решил сам 13): до 3 КБ brotli — отдельно от бюджета ядра секций (12 КБ):
// часть analytics идёт в бандл страницы сверх частей из core-parts.json (блок 5 «Секций и SDK», часть 5б). «Свой код»
// мерчанта (блок 13, custom-code.ts) — свой бюджет, 512 Б. Сборка — esm, es2022, minify. Бюджет стережёт этот тест в
// pnpm test пакета; CI site-gen его гоняет вместе с остальными тестами ядра.
const entry = (file: string): string => fileURLToPath(new URL(`../src/core/analytics/${file}`, import.meta.url));

async function brotliBytes(file: string): Promise<number> {
  const result = await build({
    entryPoints: [entry(file)],
    outfile: 'out.js',
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    write: false,
    external: ['@merfy/shell'],
    logLevel: 'silent',
  });
  return brotliCompressSync(result.outputFiles.map((out) => out.text).join('')).length;
}

describe('вес модуля аналитики', () => {
  it.each([
    ['analytics.ts', 3 * 1024],
    ['custom-code.ts', 512],
  ])('%s — до %i Б brotli', async (file, budget) => {
    expect(await brotliBytes(file)).toBeLessThanOrEqual(budget);
  });
});
