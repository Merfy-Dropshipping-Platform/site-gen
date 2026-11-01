// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { brotliCompressSync } from 'node:zlib';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

// Доля части overlay (окна поверх страницы, 01.11) в бандле страницы: бандл с ней минус бандл частей core.json — до
// 3 КБ brotli. Часть идёт только на страницы, где стоит секция поверх страницы (сборка, code.ts), бюджет ядра 16 КБ
// меряется без неё; без неё в ядре остаются только ctx.overlay = null и атрибут data-overlay.
const ENTRY = fileURLToPath(new URL('../src/core/index.ts', import.meta.url));
const BUDGET_BYTES = 3 * 1024;
const CORE = ['cart', 'consent', 'customer', 'favorites'];

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

describe('вес части overlay', () => {
  it('до 3 КБ brotli сверх частей core.json', async () => {
    const base = await brotliBytes(CORE);
    const withOverlay = await brotliBytes([...CORE, 'overlay']);
    expect(withOverlay - base).toBeGreaterThan(0);
    expect(withOverlay - base).toBeLessThanOrEqual(BUDGET_BYTES);
  });
});
