import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { listSectionFolders, readSectionFolder } from '../src/read-folder';

const SECTIONS = fileURLToPath(new URL('../fixtures/sections', import.meta.url));

describe('папки секций', () => {
  it('файлы секции — путь от папки через «/» и текст', async () => {
    const files = await readSectionFolder(`${SECTIONS}/theme-scarf-colors`);
    expect(Object.keys(files)).toEqual(['lib/label.ts', 'script.ts', 'section.json', 'template.astro']);
    expect(files['lib/label.ts']).toContain('Выбран');
  });

  it('подпапки — секции, по имени', async () => {
    const folders = await listSectionFolders(SECTIONS);
    expect(folders.map((folder) => folder.slice(SECTIONS.length + 1))).toEqual([
      'bad-import',
      'geo-locate',
      'hero',
      // Часть 6: фикстура секции с правкой в превью.
      'inline-edit',
      'kinds',
      'reviews-list',
      'shop-broken',
      'shop-color-match',
      'theme-scarf-colors',
    ]);
  });

  it('папки нет — секций нет, не ошибка', async () => {
    expect(await listSectionFolders(`${SECTIONS}/нет-такой`)).toEqual([]);
  });
});
