import { describe, expect, it } from 'vitest';
import standManifest from '../fixtures/stand-manifest.json';
import { buildJsonOf } from '../src/build-json';
import { checkManifest } from '../src/manifest';

describe('buildJsonOf', () => {
  it('поля нынешнего build.json плюс версия темы и ключ, без времени сборки', () => {
    expect(JSON.parse(buildJsonOf(checkManifest(standManifest)))).toEqual({
      siteId: '00000000-0000-4000-8000-000000000001',
      theme: 'nova',
      themeVersion: '0.0.1',
      sitesCommit: '0123456789abcdef0123456789abcdef01234567',
      buildKey: 'sha256:3333333333333333333333333333333333333333333333333333333333333333',
    });
  });

  it('JSON с отступом в два пробела и переводом строки в конце — как у нынешних тем', () => {
    const text = buildJsonOf(checkManifest(standManifest));
    expect(text.startsWith('{\n  "siteId": ')).toBe(true);
    expect(text.endsWith('}\n')).toBe(true);
  });
});
