import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashOf, sha256 } from '../src/canonical';
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
// Поведения (блок 6, часть 6б): минимальный манифест с обязательными part, reveal, animate; подробно — shell-kit.test.ts.
const KIT_FILES = {
  'animate.js': 'export const animate = () => {};',
  'part.js': 'export const behaviors = () => ({});',
  'reveal.js': 'export const reveal = {};',
};
const KIT_ENTRIES = Object.fromEntries(
  ['animate', 'part', 'reveal'].map((name) => [name, { file: `${name}.js`, chunks: [], brotli: 1 }]),
);
const BUILT = {
  'core.json': JSON.stringify({ version: '0.1.0', brotliBytes: 7784, parts: ['auth', 'cart', 'favorites'] }),
  'core.js': CORE_JS,
  'behaviors/behaviors.json': JSON.stringify({ version: '0.1.0', entries: KIT_ENTRIES, total: 3 }),
  ...Object.fromEntries(Object.entries(KIT_FILES).map(([name, text]) => [`behaviors/${name}`, text])),
};

describe('readShellBuild', () => {
  it('версия и части — из core.json, текст — core.js, hash — sha256 core.js', async () => {
    const build = await readShellBuild(await fakeRoot(BUILT));
    expect(build).toEqual({
      version: '0.1.0',
      hash: hashOf({
        core: sha256(CORE_JS),
        behaviors: Object.fromEntries(Object.entries(KIT_FILES).map(([name, text]) => [name, sha256(text)])),
      }),
      parts: ['auth', 'cart', 'favorites'],
      code: CORE_JS,
      kit: { files: new Map(Object.entries(KIT_FILES)), behaviors: [] },
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
