import { describe, expect, it } from 'vitest';
import { releaseFolders } from '../src/section-releases';

// Папки двери выпуска при старте сборщика: секции платформы и каждой загруженной темы.
describe('releaseFolders', () => {
  it('секции платформы — выпуском версии ядра, секции темы — выпуском версии темы', () => {
    const themes = new Map([
      ['nova', { version: '0.0.4' }],
      ['aurora', { version: '1.2.0' }],
    ]);
    expect(releaseFolders('/site-gen', '0.1.0', themes)).toEqual([
      { door: { author: 'platform', release: '0.1.0' }, root: '/site-gen/packages/storefront-shell/sections' },
      { door: { author: 'theme', theme: 'nova', release: '0.0.4' }, root: '/site-gen/themes/nova/sections' },
      { door: { author: 'theme', theme: 'aurora', release: '1.2.0' }, root: '/site-gen/themes/aurora/sections' },
    ]);
  });
});
