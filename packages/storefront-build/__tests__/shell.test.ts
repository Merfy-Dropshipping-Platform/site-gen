import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256 } from '../src/canonical';
import { SHELL_DIST, readShellBuild } from '../src/shell';

// Корень site-gen во временной папке: только dist ядра секций (packages/storefront-shell/dist).
async function fakeRoot(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'merfy-shell-'));
  for (const [path, text] of Object.entries(files)) {
    const file = join(root, SHELL_DIST, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
  return root;
}

const CORE_JS = 'export const start = () => {}; export const cart = {};';
const BUILT = {
  'core.json': JSON.stringify({ version: '0.1.0', brotliBytes: 7784, parts: ['auth', 'cart', 'favorites'] }),
  'core.js': CORE_JS,
};

describe('readShellBuild', () => {
  it('версия и части — из core.json, текст — core.js, hash — sha256 core.js', async () => {
    const build = await readShellBuild(await fakeRoot(BUILT));
    expect(build).toEqual({
      version: '0.1.0',
      hash: sha256(CORE_JS),
      parts: ['auth', 'cart', 'favorites'],
      code: CORE_JS,
    });
    const other = await readShellBuild(await fakeRoot({ ...BUILT, 'core.js': `${CORE_JS} // 2` }));
    expect(other.hash).not.toBe(build.hash);
  });

  it('нет core.json или core.js — shell-missing с подсказкой, как собрать', async () => {
    const message = `${SHELL_DIST}: нет сборки ядра: pnpm --filter @merfy/shell build`;
    await expect(readShellBuild(await fakeRoot({}))).rejects.toMatchObject({ code: 'shell-missing', message });
    await expect(readShellBuild(await fakeRoot({ 'core.json': BUILT['core.json'] }))).rejects.toMatchObject({
      code: 'shell-missing',
      message,
    });
  });

  it('core.json старого вида (без parts) или с чужим именем части — shell-missing', async () => {
    const old = JSON.stringify({ version: '0.1.0', brotliBytes: 7784 });
    await expect(readShellBuild(await fakeRoot({ ...BUILT, 'core.json': old }))).rejects.toMatchObject({
      code: 'shell-missing',
    });
    const strange = JSON.stringify({ version: '0.1.0', brotliBytes: 7784, parts: ['Cart'] });
    await expect(readShellBuild(await fakeRoot({ ...BUILT, 'core.json': strange }))).rejects.toMatchObject({
      code: 'shell-missing',
      path: 'parts.0',
    });
  });
});
