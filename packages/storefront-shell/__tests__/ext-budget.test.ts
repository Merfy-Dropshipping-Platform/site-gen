// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { brotliCompressSync } from 'node:zlib';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

// Доля части ext (блок 9, часть 9в) в бандле страницы: бандл с ext минус бандл частей core.json без неё — до 2 КБ
// brotli. Ext идёт только на страницы, где секция объявила "ext:<id>" (Р9в-9), бюджет ядра 12 КБ меряется без неё.
const ENTRY = fileURLToPath(new URL('../src/core/index.ts', import.meta.url));
const BUDGET_BYTES = 2 * 1024;

async function brotliBytes(parts: readonly string[]): Promise<number> {
  const contents = `import { start, ${parts.join(', ')} } from ${JSON.stringify(ENTRY)};\nstart({ parts: [${parts.join(', ')}], sections: [] });`;
  const result = await build({
    stdin: { contents, loader: 'js', resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    write: false,
    logLevel: 'silent',
  });
  return brotliCompressSync(result.outputFiles.map((file) => file.text).join('')).length;
}

describe('вес части ext', () => {
  it('до 2 КБ brotli сверх частей core.json', async () => {
    const base = await brotliBytes(['auth', 'cart', 'favorites']);
    const withExt = await brotliBytes(['auth', 'cart', 'favorites', 'ext']);
    expect(withExt - base).toBeLessThanOrEqual(BUDGET_BYTES);
  });
});
