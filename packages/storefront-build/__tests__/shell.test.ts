import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashOf, sha256 } from '../src/canonical';
import { SHELL_DIST, readShellBuild } from '../src/shell';

// Корень site-gen во временной папке: только dist ядра (packages/storefront-shell/dist).
async function fakeRoot(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'merfy-shell-'));
  for (const [path, text] of Object.entries(files)) {
    const file = join(root, SHELL_DIST, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
  return root;
}

const BUILT = {
  'shell.json': JSON.stringify({ version: '0.1.0', preload: ['shell.js', 'part-AB12CD34.js'], brotliBytes: 2048 }),
  'shell/shell.js': 'import "./part-AB12CD34.js";',
  'shell/part-AB12CD34.js': 'export const cart = {};',
  'shell/part-EF56GH78.js': 'export const favorites = {};',
};

describe('readShellBuild', () => {
  it('версия и подсказки — из shell.json, файлы — из dist/shell по пути, отпечаток — от путей и байтов', async () => {
    const build = await readShellBuild(await fakeRoot(BUILT));
    expect(build.version).toBe('0.1.0');
    expect(build.preload).toEqual(['shell.js', 'part-AB12CD34.js']);
    expect(build.files.map((file) => file.path)).toEqual(['part-AB12CD34.js', 'part-EF56GH78.js', 'shell.js']);
    const hashes = Object.fromEntries(build.files.map((file): [string, string] => [file.path, sha256(file.content)]));
    expect(build.hash).toBe(hashOf(hashes));
    const other = await readShellBuild(
      await fakeRoot({ ...BUILT, 'shell/shell.js': 'import "./part-AB12CD34.js"; // 2' }),
    );
    expect(other.hash).not.toBe(build.hash);
  });

  it('нет сборки или подсказка называет файл, которого нет, — shell-missing', async () => {
    await expect(readShellBuild(await fakeRoot({}))).rejects.toMatchObject({
      code: 'shell-missing',
      message: `${SHELL_DIST}: нет сборки ядра: pnpm --filter @merfy/shell build`,
    });
    const wrong = JSON.stringify({ version: '0.1.0', preload: ['shell.js', 'part-00000000.js'], brotliBytes: 1 });
    await expect(readShellBuild(await fakeRoot({ ...BUILT, 'shell.json': wrong }))).rejects.toMatchObject({
      code: 'shell-missing',
      message: `${SHELL_DIST}: в сборке ядра нет part-00000000.js`,
    });
  });
});
