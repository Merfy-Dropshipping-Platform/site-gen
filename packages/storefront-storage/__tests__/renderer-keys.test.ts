import { describe, expect, it } from 'vitest';
import { RENDERERS_PREFIX, releaseShotKey, rendererArchiveKey, rendererIndexKey } from '../src/layout';

const HASH = `sha256:${'ab'.repeat(32)}`;

describe('ключи рисовальщиков и снимков (блок 10)', () => {
  it('архив — по отпечатку версии, вне storefront/', () => {
    expect(rendererArchiveKey('nova', HASH)).toBe(`storefront-renderers/nova/${'ab'.repeat(32)}.tar.gz`);
    expect(RENDERERS_PREFIX.startsWith('storefront/')).toBe(false);
  });

  it('запись версий темы', () => {
    expect(rendererIndexKey('nova')).toBe('storefront-renderers/nova/versions.json');
  });

  it('снимки выпуска — под storefront/, их открывают по ссылке', () => {
    expect(releaseShotKey(12, 'home-390-before.png')).toBe('storefront/release-shots/12/home-390-before.png');
  });

  it('отпечаток не по формату — ошибка', () => {
    expect(() => rendererArchiveKey('nova', 'sha1:xx')).toThrow('ожидался хэш sha256');
  });
});
