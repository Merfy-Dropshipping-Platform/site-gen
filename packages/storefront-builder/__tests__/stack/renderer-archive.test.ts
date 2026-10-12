import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readThemeState } from '@merfy/storefront-build';
import { rendererArchiveKey, rendererIndexKey } from '@merfy/storefront-storage';
import { afterAll, describe, expect, it } from 'vitest';
import { downloadRenderer, ensureRendererArchive, readRendererIndex, rendererFiles } from '../../src/renderer-archive';
import { openHarness } from './builder';

// Настоящая серверная сборка nova (pnpm renderer) → архив в MinIO стенда → распаковка во временную папку.
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const harness = openHarness();
const deps = { store: harness.store, log: harness.deps.log, clock: harness.deps.clock };

afterAll(async () => {
  await harness.close();
});

describe('архив рисовальщика nova в MinIO', () => {
  it('старт кладёт архив и строку версии; второй старт ничего не пишет', async () => {
    const state = await readThemeState(ROOT, 'nova');
    await harness.store.remove([rendererIndexKey('nova'), rendererArchiveKey('nova', state.contentHash)]);
    expect(await ensureRendererArchive(deps, ROOT, 'nova', state)).toBe('added');
    expect(await ensureRendererArchive(deps, ROOT, 'nova', state)).toBe('present');
    const index = await readRendererIndex(harness.store, 'nova');
    expect(index.versions[state.version]?.contentHash).toBe(state.contentHash);
  });

  it('та же версия с другим отпечатком — отказ старта', async () => {
    const state = await readThemeState(ROOT, 'nova');
    const forged = { ...state, contentHash: `sha256:${'f'.repeat(64)}` };
    await expect(ensureRendererArchive(deps, ROOT, 'nova', forged)).rejects.toMatchObject({ code: 'renderer-archive' });
  });

  it('архив распаковывается вне репозитория и называет свою версию', async () => {
    const state = await readThemeState(ROOT, 'nova');
    const dir = join(await mkdtemp(join(tmpdir(), 'renderer-stack-')), 'nova');
    expect(await downloadRenderer(harness.store, 'nova', state.version, dir)).toEqual(state);
    expect(rendererFiles(dir).serverEntry).toBe(join(dir, 'server', 'entry.mjs'));
  });
});
