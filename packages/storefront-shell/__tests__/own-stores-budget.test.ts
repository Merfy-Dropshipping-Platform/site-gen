// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { brotliCompressSync } from 'node:zlib';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

// Код своих сторов (свои сторы, 01.11) — только в бандле страниц, где они есть: сборка импортирует pageStores из ядра
// лишь тогда (storefront-build, bundle.ts). Бандл страницы без сторов — как у ядра без них: ни запуска сторов, ни разбора
// uses "store:…"; в ядре от них остаются только ctx.stores и раскладка этих uses по ctx.stores (instance.ts).
const ENTRY = fileURLToPath(new URL('../src/core/index.ts', import.meta.url));
const BUDGET_BYTES = 2 * 1024;
const CORE = ['cart', 'consent', 'customer', 'favorites'];

async function bundleOf(withStores: boolean): Promise<string> {
  const imports = ['start', ...CORE, ...(withStores ? ['pageStores'] : [])].join(', ');
  const stores = withStores ? ', stores: pageStores([])' : '';
  const contents = `import { ${imports} } from ${JSON.stringify(ENTRY)};\nstart({ parts: [${CORE.join(', ')}], sections: []${stores} });`;
  const result = await build({
    stdin: { contents, loader: 'js', resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    write: false,
    logLevel: 'silent',
    charset: 'utf8',
  });
  return result.outputFiles.map((file) => file.text).join('');
}

const brotliOf = (code: string): number => brotliCompressSync(code).length;

describe('вес своих сторов', () => {
  it('страница без сторов: ни запуска сторов, ни их текстов в бандле', async () => {
    const code = await bundleOf(false);
    expect(code).not.toContain('читает сам себя по кругу');
    expect(code).not.toContain('Сбой стора');
    expect(code).not.toContain('`стора ${'); // ответ partApi на "store:…" — из own-stores.ts
  });

  it('страница со сторами: запуск сторов в бандле, до 2 КБ brotli сверх ядра', async () => {
    const [base, withStores] = await Promise.all([bundleOf(false), bundleOf(true)]);
    expect(withStores).toContain('читает сам себя по кругу');
    expect(withStores).toContain('Сбой стора');
    expect(brotliOf(withStores) - brotliOf(base)).toBeGreaterThan(0);
    expect(brotliOf(withStores) - brotliOf(base)).toBeLessThanOrEqual(BUDGET_BYTES);
  });
});
