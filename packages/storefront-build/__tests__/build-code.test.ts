import { describe, expect, it } from 'vitest';
import { buildStorefront, type ThemeBuild } from '../src/build';
import { modulePath, shellDir } from '../src/code';
import type { RenderPage } from '../src/page';
import { ASSETS, MODULES, SHELL, codeInputs } from './support-code';
import { fakeRender, novaTokens } from './support-theme';

// Сборка магазина с кодом секций (блок 7): файлы ядра и скриптов — в сборке и манифесте, код — в странице.
const REFERENCES = { platformCommit: '0123456789abcdef0123456789abcdef01234567' };
const CLIENT_FILES = [{ path: '_astro/index.css', content: Buffer.from('body{margin:0}') }];
const theme: ThemeBuild = { tokens: novaTokens, render: fakeRender, clientFiles: CLIENT_FILES };

describe('buildStorefront с кодом секций', () => {
  it('файлы ядра и скриптов — в сборке и манифесте, код — в главной, в манифесте — версия ядра', async () => {
    const { manifest, files } = await buildStorefront(codeInputs(), REFERENCES, theme, ASSETS);
    const dir = shellDir(SHELL.hash);
    const modules = [...MODULES.keys()].map(modulePath);
    const expected = ['_astro/index.css', ...modules, `${dir}/part-AB12CD34.js`, `${dir}/shell.js`, 'index.html'];
    expect(files.map((file) => file.path)).toEqual(expected.sort());
    // Файлы шрифтов (блок 12) — только в манифесте, без байтов.
    const fontPaths = Object.keys(manifest.files).filter((path) => path.startsWith('_fonts/'));
    expect(Object.keys(manifest.files)).toEqual([...files.map((file) => file.path), ...fontPaths]);
    expect(manifest.shell).toEqual({ version: '0.1.0' });
    const home = new TextDecoder().decode(files.find((file) => file.path === 'index.html')?.content);
    expect(home).toContain('id="merfy-modules"');
    expect(home).toContain('<merfy-section data-section="reviews:list">');
  });

  it('нет файла скрипта — ошибка code-missing до рендера: рисовальщик не звали', async () => {
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
