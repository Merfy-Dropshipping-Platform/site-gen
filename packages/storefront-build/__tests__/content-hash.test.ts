import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentHash, layoutFiles } from '../src/content-hash';

const PATTERNS = ['theme/src/shop/**', 'theme/pnpm-lock.yaml'];

// Папка-образец: файлы под шаблонами, файл вне шаблонов, зависимости и служебный файл Finder.
function sampleRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'storefront-hash-'));
  const files: Record<string, string> = {
    'theme/src/shop/pages/index.astro': '<h1>магазин</h1>',
    'theme/src/shop/ShopHead.astro': '<title>магазин</title>',
    'theme/pnpm-lock.yaml': 'lockfileVersion: 9.0',
    'theme/src/stand/StandPage.astro': '<h1>стенд</h1>',
    'theme/src/shop/node_modules/x/index.js': 'export {}',
    'theme/src/shop/.DS_Store': 'finder',
  };
  Object.entries(files).forEach(([path, text]) => write(root, path, text));
  return root;
}

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

describe('layoutFiles', () => {
  it('файлы под шаблонами по порядку, без зависимостей и .DS_Store', async () => {
    await expect(layoutFiles(sampleRoot(), PATTERNS)).resolves.toEqual([
      'theme/pnpm-lock.yaml',
      'theme/src/shop/ShopHead.astro',
      'theme/src/shop/pages/index.astro',
    ]);
  });
});

describe('contentHash', () => {
  it('те же файлы — тот же отпечаток, в формате sha256', async () => {
    const hash = await contentHash(sampleRoot(), PATTERNS);
    await expect(contentHash(sampleRoot(), PATTERNS)).resolves.toBe(hash);
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it.each<[string, (root: string) => void]>([
    ['правка файла', (root) => write(root, 'theme/src/shop/pages/index.astro', '<h1>другой</h1>')],
    ['новый файл', (root) => write(root, 'theme/src/shop/pages/about.astro', '<h1>о нас</h1>')],
    [
      'переименование',
      (root) => renameSync(join(root, 'theme/src/shop/ShopHead.astro'), join(root, 'theme/src/shop/Head.astro')),
    ],
  ])('%s под шаблоном меняет отпечаток', async (_title, change) => {
    const root = sampleRoot();
    const before = await contentHash(root, PATTERNS);
    change(root);
    await expect(contentHash(root, PATTERNS)).resolves.not.toBe(before);
  });

  it('правка вне шаблонов отпечаток не меняет', async () => {
    const root = sampleRoot();
    const before = await contentHash(root, PATTERNS);
    write(root, 'theme/src/stand/StandPage.astro', '<h1>новый стенд</h1>');
    write(root, 'theme/src/shop/.DS_Store', 'finder again');
    await expect(contentHash(root, PATTERNS)).resolves.toBe(before);
  });
});
