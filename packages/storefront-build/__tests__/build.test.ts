import { panelForTheme, parsePanel } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import panelJson from '../../theme-contract/panel/theme-panel.json';
import standInputsJson from '../fixtures/stand-inputs.json';
import { buildStorefront, type ThemeBuild } from '../src/build';
import { sha256 } from '../src/canonical';
import type { BuildFile } from '../src/client-files';
import { entityHashes, entityKey } from '../src/entities';
import { changedEntities, dependentPages } from '../src/graph';
import { shopFonts } from '../src/head';
import { buildKey } from '../src/key';
import type { StandPageLocals } from '../src/locals';
import type { StandBuild } from '../src/stand';
import { rawInputs, standInputs } from './support';
import { fakeRender, novaTokens } from './support-theme';

const REFERENCES = { platformCommit: '0123456789abcdef0123456789abcdef01234567' };
const CLIENT_FILES = [
  { path: '_astro/index.css', content: Buffer.from('body{margin:0}') },
  { path: '_astro/manrope.woff2', content: Buffer.from([0, 1, 2]) },
];
const theme: ThemeBuild = { tokens: novaTokens, render: fakeRender, clientFiles: CLIENT_FILES };

// Подставной рисовальщик стенда: печатает режим, CSS токенов и слушатель превью, если он есть.
const fakeRenderStand = (locals: StandPageLocals): Promise<string> => {
  const agent = locals.head.previewScript === '' ? '' : '<script>agent</script>';
  const fonts = `<style id="merfy-fonts">${locals.head.fontsCss}</style>`;
  const head = `${fonts}<style id="merfy-tokens">${locals.head.tokensCss}</style>${agent}`;
  return Promise.resolve(`<html><head>${head}</head><body data-mode="${locals.config.mode}"></body></html>`);
};
const stand: StandBuild = {
  tokens: novaTokens,
  panel: panelForTheme(parsePanel(panelJson, novaTokens.dictionary), undefined),
  renderStand: fakeRenderStand,
};
const withStand: ThemeBuild = { ...theme, stand };
const standHtml = (files: readonly BuildFile[]): string =>
  new TextDecoder().decode(files.find((file) => file.path === 'theme-stand.html')?.content);

// Страница стенда в сборке (шаг 7 блока 9 — эталон стенда на dev по адресу магазина): только у темы со стендом.
describe('buildStorefront: страница стенда', () => {
  it('тема со стендом — /theme-stand в файлах и манифесте, страница сайта, режим live без слушателя превью', async () => {
    const { manifest, files } = await buildStorefront(standInputsJson, REFERENCES, withStand);
    expect(manifest.pages.map((page) => [page.path, page.file])).toEqual([
      ['/', 'index.html'],
      ['/theme-stand', 'theme-stand.html'],
    ]);
    const site = { type: 'site', id: standInputs.site.id };
    expect(manifest.pages[1]).toMatchObject({ entity: site, deps: [entityKey('site', standInputs.site.id)] });
    expect(standHtml(files)).toContain('data-mode="live"');
    expect(standHtml(files)).not.toContain('<script>');
    expect(standHtml(files)).toContain('<style id="merfy-fonts">@font-face{font-family:"Onest"');
    expect(standHtml(files)).toContain('url(/_fonts/onest-');
  });

  it('правки токенов из ревизии — в CSS стенда', async () => {
    const raw = rawInputs((inputs) =>
      Object.assign(inputs.revision, { tokens: { schemes: { 'scheme-1': { primary: '#0f766e' } } } }),
    );
    const { files } = await buildStorefront(raw, REFERENCES, withStand);
    expect(standHtml(files)).toContain('#0f766e');
  });

  it('ключ и главная — те же, что без стенда; без стенда сборка прежняя', async () => {
    const [plain, standed, unset] = await Promise.all([
      buildStorefront(standInputsJson, REFERENCES, theme),
      buildStorefront(standInputsJson, REFERENCES, withStand),
      buildStorefront(standInputsJson, REFERENCES, { ...theme, stand: undefined }),
    ]);
    expect(standed.manifest.key).toBe(plain.manifest.key);
    expect(standed.manifest.files['index.html']).toBe(plain.manifest.files['index.html']);
    expect(unset).toEqual(plain);
  });
});

describe('buildStorefront', () => {
  it('стенд: файлы клиента и главная по пути, манифест сходится с ними', async () => {
    const { manifest, files } = await buildStorefront(standInputsJson, REFERENCES, theme);
    expect(files.map((file) => file.path)).toEqual([
      '404.html',
      '502.html',
      '_astro/index.css',
      '_astro/manrope.woff2',
      'checkout-result/index.html',
      'checkout/index.html',
      'index.html',
    ]);
    const fonts = shopFonts(standInputs, novaTokens).files.map((file) => [file.path, file.hash]);
    expect(manifest.files).toEqual(
      Object.fromEntries([...files.map((file) => [file.path, sha256(file.content)]), ...fonts]),
    );
    expect(manifest.pages.map((page) => page.path)).toEqual(['/']);
  });

  it('в манифесте — ключ входов, версии, справка о коммите и карта сущностей', async () => {
    const { manifest } = await buildStorefront(standInputsJson, REFERENCES, theme);
    expect(manifest).toMatchObject({
      v: 1,
      key: buildKey(standInputs),
      platform: { commit: REFERENCES.platformCommit, renderHash: standInputs.platform.renderHash },
      theme: standInputs.theme,
      shell: null,
      shop: { id: standInputs.site.id },
      entities: entityHashes(standInputs),
    });
  });

  it('одинаковые входы — одинаковые файлы и манифест', async () => {
    const [first, second] = await Promise.all([
      buildStorefront(standInputsJson, REFERENCES, theme),
      buildStorefront(structuredClone(standInputsJson), REFERENCES, theme),
    ]);
    expect(second).toEqual(first);
  });

  it('другой год — другой ключ и главная, файлы клиента те же', async () => {
    const [before, after] = await Promise.all([
      buildStorefront(standInputsJson, REFERENCES, theme),
      buildStorefront(
        rawInputs((raw) => (raw.year = 2027)),
        REFERENCES,
        theme,
      ),
    ]);
    expect(after.manifest.key).not.toBe(before.manifest.key);
    const changed = Object.keys(before.manifest.files).filter(
      (path) => before.manifest.files[path] !== after.manifest.files[path],
    );
    // Блок 10, часть 10а: оформление тоже печатает год — файлы оформления меняются вместе с главной.
    expect(changed).toEqual(['checkout-result/index.html', 'checkout/index.html', 'index.html']);
  });

  it('другой коммит платформы — те же файлы и ключ: коммит только справка', async () => {
    const other = { platformCommit: 'f'.repeat(40) };
    const [before, after] = await Promise.all([
      buildStorefront(standInputsJson, REFERENCES, theme),
      buildStorefront(standInputsJson, other, theme),
    ]);
    expect(after.files).toEqual(before.files);
    expect(after.manifest.key).toBe(before.manifest.key);
    expect(after.manifest.platform.commit).toBe(other.platformCommit);
  });

  it('правка имени магазина — по графу перерисовать главную', async () => {
    const [before, after] = await Promise.all([
      buildStorefront(standInputsJson, REFERENCES, theme),
      buildStorefront(
        rawInputs((raw) => (raw.site.name = 'Лён и шерсть')),
        REFERENCES,
        theme,
      ),
    ]);
    const changed = changedEntities(before.manifest.entities, after.manifest.entities);
    expect(dependentPages(before.manifest, changed)).toEqual(['/']);
  });

  it('снимок данных не получен — сборки нет', async () => {
    const failed = rawInputs((raw) => (raw.data.status = 'failed'));
    await expect(buildStorefront(failed, REFERENCES, theme)).rejects.toMatchObject({ code: 'data-not-received' });
  });
});
