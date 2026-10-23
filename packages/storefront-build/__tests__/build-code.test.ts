import { describe, expect, it } from 'vitest';
import { buildStorefront, type ThemeBuild } from '../src/build';
import type { CodeNotice } from '../src/bundle';
import type { RenderPage } from '../src/page';
import { ASSETS, codeInputs } from './support-code';
import { fakeRender, novaTokens } from './support-theme';

// Сборка магазина с кодом секций (блок 7; бандл страницы — блок 5 «Секций и SDK», часть 5б): файл бандла — в сборке и
// манифесте, тег бандла — в <head> главной; файлов старого ядра и модулей секций нет.
const REFERENCES = { platformCommit: '0123456789abcdef0123456789abcdef01234567' };
const CLIENT_FILES = [{ path: '_astro/index.css', content: Buffer.from('body{margin:0}') }];
const theme: ThemeBuild = { tokens: novaTokens, render: fakeRender, clientFiles: CLIENT_FILES };
// Подставной рендер секций: имя секции и класс из словаря.
const renderSection = (request: { section: string }): Promise<string> =>
  Promise.resolve(`<p class="flex">${request.section}</p>`);

describe('buildStorefront с кодом секций', () => {
  it('файл бандла _merfy/b/<sha256>.js — в сборке и манифесте, его тег — в главной; в манифесте — версия ядра', async () => {
    const { manifest, files } = await buildStorefront(codeInputs(), REFERENCES, theme, ASSETS, renderSection);
    const paths = files.map((file) => file.path);
    const bundles = paths.filter((path) => path.startsWith('_merfy/'));
    expect(bundles).toHaveLength(1);
    expect(bundles[0]).toMatch(/^_merfy\/b\/[0-9a-f]{64}\.js$/);
    expect(paths).toEqual(['_astro/index.css', bundles[0], 'index.html'].sort());
    // Файлы шрифтов (блок 12) — только в манифесте, без байтов.
    const fontPaths = Object.keys(manifest.files).filter((path) => path.startsWith('_fonts/'));
    expect(Object.keys(manifest.files)).toEqual([...paths, ...fontPaths]);
    expect(manifest.shell).toEqual({ version: '0.1.0' });
    const home = new TextDecoder().decode(files.find((file) => file.path === 'index.html')?.content);
    expect(home).toContain(`<script type="module" src="/${bundles[0]}"></script>`);
    expect(home.split('<script type="module"')).toHaveLength(2);
    expect(home).toContain('<merfy-section data-section="reviews:list" data-section-id="list-1"');
    expect(home).toContain('data-merfy-input');
  });

  it('те же входы — те же файлы и тот же бандл; предупреждения сборки бандла — в notice', async () => {
    const notices: CodeNotice[] = [];
    const first = await buildStorefront(codeInputs(), REFERENCES, theme, ASSETS, renderSection);
    const second = await buildStorefront(
      codeInputs(),
      REFERENCES,
      theme,
      ASSETS,
      renderSection,
      undefined,
      (_page, notice) => notices.push(notice),
    );
    expect(second.manifest).toEqual(first.manifest);
    expect(notices).toEqual([]);
  });

  it('нет файла скрипта — ошибка code-missing до рендера: рендер страниц не звали', async () => {
    const paths: string[] = [];
    const render: RenderPage = (path, locals) => {
      paths.push(path);
      return fakeRender(path, locals);
    };
    const assets = { ...ASSETS, modules: new Map<string, Uint8Array>() };
    await expect(buildStorefront(codeInputs(), REFERENCES, { ...theme, render }, assets)).rejects.toMatchObject({
      code: 'code-missing',
    });
    expect(paths).toEqual([]);
  });
});
