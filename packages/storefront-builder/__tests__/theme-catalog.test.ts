import { NO_MIGRATIONS, panelForTheme, parsePanel, parseTheme } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import panelJson from '../../theme-contract/panel/theme-panel.json';
import novaTheme from '../../theme-nova/theme.json';
import type { LoadedTheme } from '../src/build-job';
import type { PreviewTheme } from '../src/stand-preview';
import { createThemeCatalog, type CatalogDeps, type LoadedVersion } from '../src/theme-catalog';

const HASH_CURRENT = `sha256:${'c'.repeat(64)}`;
const HASH_OLD = `sha256:${'0'.repeat(64)}`;
// Подставные тема и превью — настоящие токены и панель nova, рисовальщик отдаёт номер версии. Линтер пакета запрещает
// `as` и в тестах (consistent-type-assertions: never), поэтому у превью все поля PreviewTheme.
const TOKENS = parseTheme(novaTheme.tokens);
const PANEL = panelForTheme(parsePanel(panelJson, TOKENS.dictionary), undefined);
const fakeTheme = (version: string, contentHash: string): LoadedTheme => ({
  version,
  contentHash,
  build: { tokens: TOKENS, render: () => Promise.resolve(version), clientFiles: [] },
});
const fakePreview = (version: string): PreviewTheme => ({
  version,
  themeTokens: novaTheme.tokens,
  tokens: TOKENS,
  panel: PANEL,
  renderStand: () => Promise.resolve(version),
  assets: new Map(),
  migrations: NO_MIGRATIONS,
});
const CURRENT = fakeTheme('0.2.0', HASH_CURRENT);
const PREVIEW = fakePreview('0.2.0');

function catalogWith(overrides: Partial<CatalogDeps> = {}) {
  const calls = { load: 0, index: 0 };
  const deps: CatalogDeps = {
    current: new Map([['nova', CURRENT]]),
    previews: new Map([['nova', PREVIEW]]),
    index: () => {
      calls.index += 1;
      return Promise.resolve({ '0.1.0': { contentHash: HASH_OLD } });
    },
    load: (themeId, version): Promise<LoadedVersion> => {
      calls.load += 1;
      const theme = fakeTheme(version, HASH_OLD);
      return Promise.resolve({ theme, preview: fakePreview(version), close: () => Promise.resolve() });
    },
    released: () => Promise.resolve('0.2.0'),
    log: () => undefined,
    ...overrides,
  };
  return { catalog: createThemeCatalog(deps), calls };
}

describe('каталог версий темы (design.md блока 10, П10-1 Б)', () => {
  it('версия образа — без загрузки', async () => {
    const { catalog, calls } = catalogWith();
    expect(await catalog.themeAt('nova', '0.2.0')).toBe(CURRENT);
    expect(await catalog.stateOf('nova', '0.2.0')).toEqual({ version: '0.2.0', contentHash: HASH_CURRENT });
    expect(calls).toEqual({ load: 0, index: 0 });
  });

  it('прошлая версия грузится один раз, даже при одновременных запросах', async () => {
    const { catalog, calls } = catalogWith();
    const [a, b] = await Promise.all([catalog.themeAt('nova', '0.1.0'), catalog.themeAt('nova', '0.1.0')]);
    expect(a).toBe(b);
    expect(a.version).toBe('0.1.0');
    expect((await catalog.previewAt('nova', '0.1.0')).version).toBe('0.1.0');
    expect(calls.load).toBe(1);
  });

  it('загрузка упала — следующий запрос пробует снова', async () => {
    const answers = [
      () => Promise.reject(new Error('MinIO не ответил')),
      () =>
        Promise.resolve({
          theme: fakeTheme('0.1.0', HASH_OLD),
          preview: fakePreview('0.1.0'),
          close: () => Promise.resolve(),
        }),
    ];
    const { catalog } = catalogWith({ load: () => (answers.shift() ?? answers[0])() });
    await expect(catalog.themeAt('nova', '0.1.0')).rejects.toThrow('MinIO не ответил');
    expect((await catalog.themeAt('nova', '0.1.0')).version).toBe('0.1.0');
  });

  it('запись версий: известная — из записи, неизвестная — null и перепроверка, чужая тема — null', async () => {
    const { catalog, calls } = catalogWith();
    expect(await catalog.stateOf('nova', '0.1.0')).toEqual({ version: '0.1.0', contentHash: HASH_OLD });
    expect(await catalog.stateOf('nova', '0.1.0')).toEqual({ version: '0.1.0', contentHash: HASH_OLD });
    expect(calls.index).toBe(1);
    expect(await catalog.stateOf('nova', '0.0.7')).toBeNull();
    expect(calls.index).toBe(2);
    expect(await catalog.stateOf('rose', '0.1.0')).toBeNull();
  });

  it('превью версии образа — из загруженных превью', async () => {
    const { catalog } = catalogWith();
    expect(await catalog.previewAt('nova', '0.2.0')).toBe(PREVIEW);
  });
});
