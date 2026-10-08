import { describe, expect, it } from 'vitest';
import standInputsJson from '../fixtures/stand-inputs.json';
import { buildStorefront, type ThemeBuild } from '../src/build';
import { sha256 } from '../src/canonical';
import { entityHashes } from '../src/entities';
import { changedEntities, dependentPages } from '../src/graph';
import { buildKey } from '../src/key';
import { rawInputs, standInputs } from './support';
import { fakeRender, novaTokens } from './support-theme';

const REFERENCES = { platformCommit: '0123456789abcdef0123456789abcdef01234567' };
const CLIENT_FILES = [
  { path: '_astro/index.css', content: Buffer.from('body{margin:0}') },
  { path: '_astro/manrope.woff2', content: Buffer.from([0, 1, 2]) },
];
const theme: ThemeBuild = { tokens: novaTokens, render: fakeRender, clientFiles: CLIENT_FILES };

describe('buildStorefront', () => {
  it('стенд: файлы клиента и главная по пути, манифест сходится с ними', async () => {
    const { manifest, files } = await buildStorefront(standInputsJson, REFERENCES, theme);
    expect(files.map((file) => file.path)).toEqual(['_astro/index.css', '_astro/manrope.woff2', 'index.html']);
    expect(manifest.files).toEqual(Object.fromEntries(files.map((file) => [file.path, sha256(file.content)])));
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
    expect(changed).toEqual(['index.html']);
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
