// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { brotliCompressSync } from 'node:zlib';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

// Вес частей блоков расширений (блок 12 «Секций и SDK», часть 12б, Р12б-15…Р12б-16) сверх частей core.json: points —
// свой код ядра, records и purchase — строки рантаймов theme-base, встают только на страницы, где шаблон дал место.
const ENTRY = fileURLToPath(new URL('../src/core/index.ts', import.meta.url));
const BASE_PARTS = ['auth', 'cart', 'favorites'];
const BUDGET_BYTES = { points: 4 * 1024, records: 4 * 1024, purchase: 2 * 1024 } as const; // purchase без рантайма theme-base (часть 12д, Р12д-8)

async function bundleOf(parts: readonly string[]): Promise<string> {
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
  return result.outputFiles.map((file) => file.text).join('');
}

const brotliOf = (text: string): number => brotliCompressSync(text).length;

describe('вес частей блоков расширений', () => {
  it.each(['points', 'records', 'purchase'] as const)('%s — в пределах бюджета brotli', async (part) => {
    const base = brotliOf(await bundleOf(BASE_PARTS));
    const withPart = brotliOf(await bundleOf([...BASE_PARTS, part]));
    expect(withPart - base).toBeLessThanOrEqual(BUDGET_BYTES[part]);
  });

  it('purchase — без строки рантайма theme-base (часть 12д)', async () => {
    const text = await bundleOf([...BASE_PARTS, 'purchase']);
    expect(text).not.toContain('__merfyPurchase');
    expect(text).not.toContain('data-merfy-ext-purchase');
  });

  it('без новых частей сборки theme-base в бандле нет', async () => {
    const text = await bundleOf(BASE_PARTS);
    expect(text).not.toContain('__merfyPurchase');
    expect(text).not.toContain('__merfyExtensionOrders');
  });

  it('records — без строки рантайма theme-base (часть 12е)', async () => {
    const text = await bundleOf([...BASE_PARTS, 'records']);
    expect(text).not.toContain('__merfyExtensionOrders');
    expect(text).not.toContain('data-merfy-ext-orders');
  });
});
