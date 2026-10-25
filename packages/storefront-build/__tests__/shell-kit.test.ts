import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashOf, sha256 } from '../src/canonical';
import { SHELL_DIST, readShellBuild } from '../src/shell';

// Поведения в сборке ядра (блок 6, часть 6б; Р6б-3, Р6б-4): dist/behaviors/behaviors.json и файлы из него.
async function fakeRoot(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'merfy-kit-'));
  for (const [path, text] of Object.entries(files)) {
    const file = join(root, SHELL_DIST, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
  return root;
}

const entry = (file: string, chunks: string[] = []) => ({ file, chunks, brotli: 1 });
const MANIFEST = {
  version: '0.1.0',
  entries: {
    accordion: entry('accordion.js', ['chunk-AAA111.js']),
    carousel: entry('carousel.js', ['chunk-AAA111.js']),
    part: entry('part.js'),
    reveal: entry('reveal.js', ['chunk-AAA111.js']),
    animate: entry('animate.js'),
  },
  total: 5,
};
const KIT: Record<string, string> = {
  'accordion.js': 'export const accordion = {};',
  'carousel.js': 'export const carousel = {};',
  'part.js': 'export const behaviors = () => ({});',
  'reveal.js': 'export const reveal = {};',
  'animate.js': 'export const animate = () => {};',
  'chunk-AAA111.js': 'export const shared = 1;',
};
const CORE_JS = 'export const start = () => {};';
const CORE_JSON = JSON.stringify({ version: '0.1.0', brotliBytes: 100, parts: ['auth', 'cart', 'favorites'] });
const built = (change: Record<string, string> = {}, manifest: unknown = MANIFEST): Record<string, string> => ({
  'core.json': CORE_JSON,
  'core.js': CORE_JS,
  'behaviors/behaviors.json': JSON.stringify(manifest),
  ...Object.fromEntries(Object.entries(KIT).map(([name, text]) => [`behaviors/${name}`, text])),
  ...change,
});

describe('readShellBuild: поведения', () => {
  it('kit — тексты всех файлов из манифеста; behaviors — имена каталога без part, reveal, animate; hash — по ядру и файлам', async () => {
    const build = await readShellBuild(await fakeRoot(built()));
    expect([...(build.kit?.files.keys() ?? [])]).toEqual([
      'accordion.js',
      'animate.js',
      'carousel.js',
      'chunk-AAA111.js',
      'part.js',
      'reveal.js',
    ]);
    expect(build.kit?.files.get('chunk-AAA111.js')).toBe(KIT['chunk-AAA111.js']);
    expect(build.kit?.behaviors).toEqual(['accordion', 'carousel']);
    expect(build.hash).toBe(
      hashOf({
        core: sha256(CORE_JS),
        behaviors: Object.fromEntries(Object.entries(KIT).map(([name, text]) => [name, sha256(text)])),
      }),
    );
  });

  it('другой текст файла поведения или ядра — другой hash', async () => {
    const base = await readShellBuild(await fakeRoot(built()));
    const kit = await readShellBuild(
      await fakeRoot(built({ 'behaviors/reveal.js': 'export const reveal = { v: 2 };' })),
    );
    const core = await readShellBuild(await fakeRoot(built({ 'core.js': `${CORE_JS} // 2` })));
    expect(new Set([base.hash, kit.hash, core.hash]).size).toBe(3);
  });

  it('нет manifest, нет файла из него, нет part, reveal или animate, чужое имя файла — shell-missing', async () => {
    const lost = built();
    delete lost['behaviors/behaviors.json'];
    await expect(readShellBuild(await fakeRoot(lost))).rejects.toMatchObject({ code: 'shell-missing' });
    const noFile = built();
    delete noFile['behaviors/carousel.js'];
    await expect(readShellBuild(await fakeRoot(noFile))).rejects.toMatchObject({ code: 'shell-missing' });
    const rest = Object.fromEntries(Object.entries(MANIFEST.entries).filter(([name]) => name !== 'reveal'));
    await expect(readShellBuild(await fakeRoot(built({}, { ...MANIFEST, entries: rest })))).rejects.toMatchObject({
      code: 'shell-missing',
    });
    const strange = { ...MANIFEST, entries: { ...MANIFEST.entries, accordion: entry('../core.js') } };
    await expect(readShellBuild(await fakeRoot(built({}, strange)))).rejects.toMatchObject({ code: 'shell-missing' });
  });
});

// Скрипт превью в сборке ядра (блок 5, часть 5г, Р5г-11): dist/preview.js — ShellBuild.preview, в hash не входит.
describe('readShellBuild: скрипт превью', () => {
  it('preview — текст dist/preview.js, hash тот же; нет файла — ключа нет', async () => {
    const plain = await readShellBuild(await fakeRoot(built()));
    const withPreview = await readShellBuild(await fakeRoot(built({ 'preview.js': '(() => {})();' })));
    expect(withPreview.preview).toBe('(() => {})();');
    expect(withPreview.hash).toBe(plain.hash);
    expect('preview' in plain).toBe(false);
  });
});
