import { describe, expect, it } from 'vitest';
import { checkManifest } from '../src/manifest';

// Справка sections манифеста (блок 15, часть 15з, Р15з-7): секции входов сборки и хеши их правок — по ним выпуск нашей
// секции видит, дошёл ли магазин. В ключ не входит; у сборок до 15з поля нет.
const hash = (digit: string): string => `sha256:${digit.repeat(64)}`;
const BASE = {
  v: 1,
  key: hash('a'),
  platform: { commit: 'c'.repeat(40), renderHash: hash('b') },
  theme: { id: 'nova', version: '0.1.0', contentHash: hash('c') },
  shell: null,
  shop: { id: '3a9626f7-390d-4a66-bca5-a3b806ca6c1b' },
  entities: {},
  files: {},
  pages: [],
};

describe('манифест: справка sections', () => {
  it('манифест со справкой sections проходит схему, без неё — тоже', () => {
    const sections = [{ name: 'shop:cart-drawer', hash: hash('d') }];
    expect(checkManifest({ ...BASE, sections }).sections).toEqual(sections);
    expect(checkManifest(BASE).sections).toBeUndefined();
  });

  it('хеш не sha256 или пустое имя — отказ', () => {
    expect(() => checkManifest({ ...BASE, sections: [{ name: 'shop:cart-drawer', hash: 'abc' }] })).toThrow();
    expect(() => checkManifest({ ...BASE, sections: [{ name: '', hash: hash('d') }] })).toThrow();
  });
});
