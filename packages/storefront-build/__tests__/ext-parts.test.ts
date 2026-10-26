import { describe, expect, it } from 'vitest';
import { sha256 } from '../src/canonical';
import { buildStorefront, type ThemeBuild } from '../src/build';
import { parseBuildInputs, type BuildInputs } from '../src/inputs';
import { buildKey, dataKey } from '../src/key';
import { changedInputs } from './support';
import { codeInputs, MODULES, RENDERS } from './support-code';
import type { CodeAssets } from '../src/code';
import { fakeRender, novaTokens } from './support-theme';
import type { BuildFile } from '../src/client-files';

// Части точек расширений в бандле страницы (блок 15, часть 15г): extPointParts в code входов — части ядра, которые
// попадают в бандл каждой страницы по включённым местам расширений магазина, а не по местам в разметке секций. Без
// поля — бандл прежний: магазин без расширений не несёт код проверки «продаётся формой».
const REFERENCES = { platformCommit: '0123456789abcdef0123456789abcdef01234567' };
const THEME: ThemeBuild = { tokens: novaTokens, render: fakeRender, clientFiles: [] };

const CORE = [
  `export const start = (options) => { globalThis.merfyStarted = [options, '${'x'.repeat(5000)}']; };`,
  'export const defineSection = (definition) => definition;',
  "export const auth = { name: 'auth' };",
  "export const cart = { name: 'cart' };",
  "export const favorites = { name: 'favorites' };",
  "export const analytics = { name: 'analytics' };",
  "export const checkout = { name: 'checkout' };",
  "export const purchase = { name: 'purchase' };",
].join('\n');
const SHELL_BUILD = { version: '0.1.0', hash: sha256(CORE), parts: ['auth', 'cart', 'favorites'], code: CORE };
const ASSETS: CodeAssets = { shell: SHELL_BUILD, modules: MODULES, renders: RENDERS };

const withExtParts = (): BuildInputs =>
  codeInputs((inputs) => {
    inputs.shell = { version: SHELL_BUILD.version, hash: SHELL_BUILD.hash, parts: SHELL_BUILD.parts };
    inputs.code = { ...inputs.code, extPointParts: ['purchase'] };
  });

const text = (files: readonly BuildFile[], path: string): string =>
  Buffer.from(files.find((file) => file.path === path)?.content ?? new Uint8Array()).toString('utf8');

// Текст бандла страницы: страница без бандла — ошибка теста.
function bundleOf(files: readonly BuildFile[], page: string): string {
  const src = /src="\/(_merfy\/b\/[0-9a-f]{64}\.js)"/.exec(text(files, page))?.[1];
  if (src === undefined) throw new Error(`у ${page} нет бандла`);
  return text(files, src);
}

describe('extPointParts в code входов', () => {
  it('место product включено — часть purchase в бандле страницы без секций и мест', async () => {
    const renderSection = (): Promise<string> => Promise.resolve('<p class="flex">секция</p>');
    const { files } = await buildStorefront(withExtParts(), REFERENCES, THEME, ASSETS, renderSection);
    expect(bundleOf(files, 'index.html')).toMatch(/name:\s*["']purchase["']/);
  });

  it('поля нет — части purchase в бандле нет: магазин без расширений код не несёт', async () => {
    const renderSection = (): Promise<string> => Promise.resolve('<p class="flex">секция</p>');
    const noParts = codeInputs((inputs) => {
      inputs.shell = { version: SHELL_BUILD.version, hash: SHELL_BUILD.hash, parts: SHELL_BUILD.parts };
    });
    const { files } = await buildStorefront(noParts, REFERENCES, THEME, ASSETS, renderSection);
    expect(bundleOf(files, 'index.html')).not.toMatch(/name:\s*["']purchase["']/);
  });

  it('входы: список имён частей проходит, пустой список и мусор — inputs-invalid', () => {
    const base = changedInputs(() => undefined);
    const withField = (value: unknown): unknown => {
      const inputs = structuredClone(base);
      Reflect.set(inputs.code, 'extPointParts', value);
      return inputs;
    };
    expect(parseBuildInputs(withField(['purchase'])).code.extPointParts).toEqual(['purchase']);
    expect(() => parseBuildInputs(withField([]))).toThrow();
    expect(() => parseBuildInputs(withField('purchase'))).toThrow();
  });

  it('включение и выключение места меняет оба ключа — сборка и сверка видят новую витрину', () => {
    const without = codeInputs();
    expect(dataKey(without)).not.toBe(dataKey(withExtParts()));
    expect(buildKey(without)).not.toBe(buildKey(withExtParts()));
  });
});
