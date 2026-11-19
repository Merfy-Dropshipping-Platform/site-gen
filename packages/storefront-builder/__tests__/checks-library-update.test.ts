import type { UpdateOffer } from '@merfy/storefront-sections';
import { describe, expect, it } from 'vitest';
import { libraryUpdateFindings } from '../src/checks/shop/library-update';

// Находка «есть новая версия библиотечной секции» (место shop): одна на секцию, для агента, fix — ask.
const OFFER: UpdateOffer = {
  name: 'hero',
  base: { hash: 'sha256:b', name: 'hero', version: 2 },
  latest: { hash: 'sha256:l', name: 'hero', version: 5 },
};
const FILES = {
  'section.json': JSON.stringify({ sdk: 1, name: 'hero', kind: 'section', title: 'Первый экран', settings: [] }),
  'template.astro': '<section></section>',
};

describe('library-update', () => {
  it('предложения нет — находок нет', () => {
    expect(libraryUpdateFindings('shop:hero', FILES, undefined)).toEqual([]);
  });

  it('одна находка: место shop, fix ask, в тексте название, имя, версии и шаги инструмента', () => {
    const [finding, ...rest] = libraryUpdateFindings('shop:hero', FILES, OFFER);
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({
      place: 'shop',
      check: 'library-update',
      level: 'warning',
      section: null,
      where: 'shop:hero',
      fix: 'ask',
      count: 1,
    });
    const text = finding?.text ?? '';
    expect(text).toContain('«Первый экран» (shop:hero)');
    expect(text).toContain('основа копии версия 2, в библиотеке версия 5');
    expect(text).toContain('read с upgrade: true');
    expect(text).toContain('save с basedOn');
    expect(text).toContain('decline');
  });

  it('файлы без читаемого section.json — в тексте имя секции вместо названия', () => {
    const [finding] = libraryUpdateFindings('shop:hero', {}, OFFER);
    expect(finding?.text).toContain('«shop:hero» (shop:hero)');
  });
});
