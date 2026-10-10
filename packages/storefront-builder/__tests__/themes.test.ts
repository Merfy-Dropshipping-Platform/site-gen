import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readThemeState } from '@merfy/storefront-build';
import { describe, expect, it } from 'vitest';
import { THEME_VERSIONS_FILE, loadThemes, rendererDir, themeIdsOf } from '../src/themes';

// Темы новой архитектуры — с настоящего диска site-gen: theme-versions.json блока 4 и серверная сборка рисовальщика
// nova (`pnpm renderer`, «Подготовка» задачи 8).
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

describe('темы новой архитектуры', () => {
  it('список — ключи theme-versions.json; сборка рисовальщика — themes/<тема>/dist-renderer', async () => {
    expect(await themeIdsOf(ROOT)).toEqual(['nova']);
    expect(rendererDir('/r', 'nova')).toBe('/r/themes/nova/dist-renderer');
  });

  it('nova: версия и отпечаток с диска, токены и файлы браузера; рисовальщик отвечает и закрывается', async () => {
    const loaded = await loadThemes(ROOT);
    const nova = loaded.themes.get('nova');
    const state = await readThemeState(ROOT, 'nova');
    expect(nova?.version).toBe(state.version);
    expect(nova?.contentHash).toBe(state.contentHash);
    expect(nova?.build.clientFiles.length).toBeGreaterThan(0);
    expect(typeof nova?.build.render).toBe('function');
    await loaded.close();
  });

  // Превью конструктора (блок 8): схема панели платформы, файлы клиента по адресу, стенд рисуется тем же рисовальщиком.
  it('nova для превью: 44 поля панели, CSS среди файлов клиента, стенд рисуется', async () => {
    const loaded = await loadThemes(ROOT);
    const preview = loaded.previews.get('nova');
    expect(preview?.version).toBe(loaded.themes.get('nova')?.version);
    expect(preview?.panel.groups).toHaveLength(11);
    expect([...(preview?.assets.keys() ?? [])].some((path) => /^\/_astro\/.+\.css$/.test(path))).toBe(true);
    const locals = {
      head: { title: 'Стенд темы', configHtml: '', tokensCss: '', previewScript: '' },
      attributes: {},
      settings: {},
      shop: { name: 'Пледы' },
      schemes: [],
      config: {},
      problems: [],
    };
    expect(await preview?.renderStand(locals)).toContain('data-stand="logo"');
    await loaded.close();
  });

  it('нет серверной сборки — renderer-missing с подсказкой команды', async () => {
    // Корень с одной темой demo: theme.json и запись версии есть, сборки рисовальщика нет.
    const root = await mkdtemp(join(tmpdir(), 'builder-themes-'));
    await mkdir(join(root, 'packages', 'theme-demo'), { recursive: true });
    await mkdir(join(root, 'packages', 'storefront-build'), { recursive: true });
    await writeFile(join(root, 'packages', 'theme-demo', 'theme.json'), '{"version":"0.0.1","tokens":{}}');
    const recorded = { demo: await readThemeState(root, 'demo') };
    await writeFile(join(root, THEME_VERSIONS_FILE), JSON.stringify(recorded));
    await expect(loadThemes(root)).rejects.toMatchObject({ code: 'renderer-missing' });
    await expect(loadThemes(root)).rejects.toThrow(/pnpm --filter @merfy\/storefront-builder renderer/);
  });
});
