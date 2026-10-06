import { describe, expect, it } from 'vitest';
import standManifest from '../fixtures/stand-manifest.json';
import { checkManifest, checkPageRow } from '../src/manifest';
import { errorOf } from './support';

const OTHER_HASH = `sha256:${'f'.repeat(64)}`;

function changedManifest(change: (manifest: typeof standManifest) => void): unknown {
  const copy = structuredClone(standManifest);
  change(copy);
  return copy;
}

describe('checkManifest', () => {
  it('образец манифеста проходит схему как есть', () => {
    expect(checkManifest(standManifest)).toEqual(standManifest);
  });

  it.each<[string, unknown, string]>([
    ['коммит не полный', changedManifest((m) => (m.platform.commit = '0123456')), 'platform.commit'],
    ['лишнее поле', changedManifest((m) => Object.assign(m, { builtAt: '2026-10-06T09:00:00.000Z' })), 'builtAt'],
    [
      'незнакомый тип сущности страницы',
      changedManifest((m) => (m.pages[0].entity.type = 'order')),
      'pages.0.entity.type',
    ],
    [
      'дата правки без миллисекунд',
      changedManifest((m) => (m.pages[0].dataUpdatedAt = '2026-10-06T09:00:00Z')),
      'pages.0.dataUpdatedAt',
    ],
    ['хэш страницы не тот, что в files', changedManifest((m) => (m.pages[1].hash = OTHER_HASH)), 'pages.1.hash'],
    ['зависимости нет в entities', changedManifest((m) => m.pages[0].deps.push('billing:main')), 'pages.0.deps'],
  ])('%s — manifest-invalid с путём', (_title, manifest, path) => {
    const error = errorOf(() => checkManifest(manifest));
    expect(error.code).toBe('manifest-invalid');
    expect(error.path).toBe(path);
  });

  it('путь файла с «..» — manifest-invalid', () => {
    const manifest = changedManifest((m) => Object.assign(m.files, { '../secret.html': OTHER_HASH }));
    expect(errorOf(() => checkManifest(manifest)).code).toBe('manifest-invalid');
  });
});

describe('checkPageRow', () => {
  it('строка страницы проходит схему сама по себе', () => {
    expect(checkPageRow(standManifest.pages[0])).toEqual(standManifest.pages[0]);
  });

  it('строка с лишним полем — manifest-invalid', () => {
    const row = { ...standManifest.pages[0], html: '<h1>Стенд</h1>' };
    expect(errorOf(() => checkPageRow(row)).path).toBe('html');
  });
});
