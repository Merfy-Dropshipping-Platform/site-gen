import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readClientFiles } from '../src/client-files';

// Папка client/ серверной сборки во временной папке: два уровня вложенности, порядок записи — не по алфавиту.
function clientDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'storefront-client-'));
  mkdirSync(join(dir, '_astro', 'fonts'), { recursive: true });
  writeFileSync(join(dir, 'robots.txt'), 'User-agent: *\n');
  writeFileSync(join(dir, '_astro', 'index.css'), 'body{margin:0}');
  writeFileSync(join(dir, '_astro', 'fonts', 'manrope.woff2'), Buffer.from([0, 1, 2]));
  return dir;
}

describe('readClientFiles', () => {
  it('все файлы папки: путь от корня через «/», список — по пути', async () => {
    const files = await readClientFiles(clientDir());
    expect(files.map((file) => file.path)).toEqual(['_astro/fonts/manrope.woff2', '_astro/index.css', 'robots.txt']);
  });

  it('байты файла — как на диске', async () => {
    const files = await readClientFiles(clientDir());
    expect(Buffer.from(files[0].content)).toEqual(Buffer.from([0, 1, 2]));
    expect(Buffer.from(files[1].content).toString('utf8')).toBe('body{margin:0}');
  });
});
