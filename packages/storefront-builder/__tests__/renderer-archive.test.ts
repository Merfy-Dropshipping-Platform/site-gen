import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  emptyIndex,
  indexDecision,
  packRenderer,
  rendererFiles,
  unpackRenderer,
  type RendererIndex,
} from '../src/renderer-archive';

const STATE = { version: '0.2.0', contentHash: `sha256:${'a'.repeat(64)}` };
const ENTRY = { contentHash: STATE.contentHash, bytes: 10, uploadedAt: '2026-10-11T10:00:00.000Z' };
let root = '';

// Корень site-gen в миниатюре: серверная сборка темы demo и файлы её пакета.
async function fakeRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'archive-root-'));
  const renderer = join(dir, 'themes', 'demo', 'dist-renderer');
  await mkdir(join(renderer, 'server'), { recursive: true });
  await mkdir(join(renderer, 'client', '_astro'), { recursive: true });
  await writeFile(join(renderer, 'server', 'entry.mjs'), 'export const handler = () => {};\n');
  await writeFile(join(renderer, 'client', '_astro', 'shop.css'), 'body{margin:0}');
  await mkdir(join(dir, 'packages', 'theme-demo'), { recursive: true });
  for (const file of ['theme.json', 'migrations.json', 'changelog.json'])
    await writeFile(join(dir, 'packages', 'theme-demo', file), `{"file":"${file}"}`);
  return dir;
}

beforeAll(async () => {
  root = await fakeRoot();
});

describe('архив рисовальщика', () => {
  it('упаковка и распаковка: серверная сборка, клиент, файлы пакета темы и version.json', async () => {
    const body = await packRenderer(root, 'demo', STATE);
    const dir = join(await mkdtemp(join(tmpdir(), 'archive-out-')), 'demo');
    await unpackRenderer(body, dir, { id: 'demo', ...STATE });
    const files = rendererFiles(dir);
    expect(await readFile(files.serverEntry, 'utf8')).toContain('handler');
    expect(await readFile(join(files.clientDir, '_astro', 'shop.css'), 'utf8')).toBe('body{margin:0}');
    expect(JSON.parse(await readFile(files.migrationsJson, 'utf8'))).toEqual({ file: 'migrations.json' });
    expect(JSON.parse(await readFile(join(dir, 'version.json'), 'utf8'))).toEqual({ id: 'demo', ...STATE });
  });

  it('архив не той версии — ошибка renderer-archive', async () => {
    const body = await packRenderer(root, 'demo', STATE);
    const dir = join(await mkdtemp(join(tmpdir(), 'archive-out-')), 'demo');
    await expect(unpackRenderer(body, dir, { id: 'demo', ...STATE, version: '0.3.0' })).rejects.toMatchObject({
      code: 'renderer-archive',
    });
  });
});

describe('запись версий', () => {
  it('новой версии нет — добавить', () => {
    const decision = indexDecision(null, 'demo', STATE, ENTRY);
    expect(decision.outcome).toBe('added');
    expect(decision.next?.versions['0.2.0']).toEqual(ENTRY);
  });

  it('версия с тем же отпечатком — запись не трогаем', () => {
    const index: RendererIndex = { ...emptyIndex('demo'), versions: { '0.2.0': ENTRY } };
    expect(indexDecision(index, 'demo', STATE, ENTRY)).toEqual({ outcome: 'present', next: null });
  });

  it('та же версия с другим отпечатком — отказ', () => {
    const other = { ...ENTRY, contentHash: `sha256:${'b'.repeat(64)}` };
    const index: RendererIndex = { ...emptyIndex('demo'), versions: { '0.2.0': other } };
    expect(() => indexDecision(index, 'demo', STATE, ENTRY)).toThrow('уже записана с другим отпечатком');
  });
});
