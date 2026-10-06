import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkThemeVersion,
  parseThemeVersions,
  readThemeState,
  themeVersionStatus,
  type ThemeState,
} from '../src/theme-version';
import { errorOf } from './support';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const RECORDED: ThemeState = { version: '0.0.1', contentHash: HASH_A };

describe('themeVersionStatus', () => {
  it.each<[string, ThemeState | undefined, ThemeState, string]>([
    ['номер и отпечаток сходятся', RECORDED, RECORDED, 'ok'],
    ['темы нет в записи', undefined, RECORDED, 'record'],
    ['новый номер', RECORDED, { version: '0.0.2', contentHash: HASH_B }, 'record'],
    ['файлы изменились, номер тот же', RECORDED, { version: '0.0.1', contentHash: HASH_B }, 'stale'],
  ])('%s — %s', (_title, recorded, current, status) => {
    expect(themeVersionStatus(recorded, current)).toBe(status);
  });
});

describe('checkThemeVersion', () => {
  it('сходится — молчит', () => {
    expect(() => checkThemeVersion('nova', RECORDED, RECORDED)).not.toThrow();
  });

  it('файлы изменились, а номер тот же — theme-version-stale и что делать', () => {
    const error = errorOf(() => checkThemeVersion('nova', RECORDED, { version: '0.0.1', contentHash: HASH_B }));
    expect(error.code).toBe('theme-version-stale');
    expect(error.message).toBe(
      'файлы темы nova изменились, а версия 0.0.1 та же: подними version в packages/theme-nova/theme.json, потом pnpm theme-version nova',
    );
  });

  it('новой версии нет в записи — theme-version-stale и команда записи', () => {
    const error = errorOf(() => checkThemeVersion('nova', undefined, RECORDED));
    expect(error.message).toBe('версия 0.0.1 темы nova не записана: pnpm theme-version nova');
  });
});

describe('parseThemeVersions', () => {
  it('отпечаток не sha256 — ошибка с путём', () => {
    const error = errorOf(() => parseThemeVersions({ nova: { version: '0.0.1', contentHash: 'abc' } }));
    expect(error.path).toBe('nova.contentHash');
  });
});

// Корень-образец: тема demo — папка темы и theme.json пакета темы.
function sampleRoot(version: string): string {
  const root = mkdtempSync(join(tmpdir(), 'storefront-theme-'));
  const files: Record<string, string> = {
    'themes/demo/src/shop/pages/index.astro': '<h1>магазин</h1>',
    'themes/demo/src/stand/StandPage.astro': '<h1>стенд</h1>',
    'packages/theme-demo/theme.json': JSON.stringify({ name: 'demo', version, tokens: {} }),
  };
  Object.entries(files).forEach(([path, text]) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  });
  return root;
}

describe('readThemeState', () => {
  it('номер — из theme.json пакета темы; theme.json входит в отпечаток', async () => {
    const first = await readThemeState(sampleRoot('0.0.1'), 'demo');
    const second = await readThemeState(sampleRoot('0.0.2'), 'demo');
    expect([first.version, second.version]).toEqual(['0.0.1', '0.0.2']);
    expect(second.contentHash).not.toBe(first.contentHash);
  });

  it('файлы стенда в отпечаток не входят', async () => {
    const root = sampleRoot('0.0.1');
    const before = await readThemeState(root, 'demo');
    writeFileSync(join(root, 'themes/demo/src/stand/StandPage.astro'), '<h1>новый стенд</h1>');
    await expect(readThemeState(root, 'demo')).resolves.toEqual(before);
  });
});
