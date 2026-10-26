import { describe, expect, it } from 'vitest';
import { AUTO_PLACES, autoPlacePart, readManifest } from '../src/format';

// Место по умолчанию секции расширения (блок 12 «Секций и SDK», часть 12д, Р12д-12): autoPlace в section.json.
const FORM = { sdk: 1, name: 'reviews', kind: 'section', title: 'Отзывы', autoPlace: 'product' };
const filesOf = (manifest: unknown) => ({ 'section.json': JSON.stringify(manifest) });
const problemsOf = (manifest: unknown): string[] => {
  const read = readManifest(filesOf(manifest));
  return read.ok ? [] : read.problems.map((item) => item.message);
};

describe('autoPlace в section.json', () => {
  it('product — проходит; часть места — purchase', () => {
    const read = readManifest(filesOf(FORM));
    expect(read.ok ? read.value.autoPlace : null).toBe('product');
    expect(AUTO_PLACES).toEqual(['product']);
    expect(autoPlacePart('product')).toBe('purchase');
  });

  it.each<[string, unknown, string]>([
    ['незнакомое место', { ...FORM, autoPlace: 'cart' }, 'autoPlace'],
    ['не на странице', { ...FORM, groups: ['footer'] }, 'autoPlace: секция встаёт на страницу — нужна группа page'],
    [
      'глобальный скрипт',
      { sdk: 1, name: 'counter', kind: 'global', title: 'Счётчик', autoPlace: 'product' },
      'autoPlace: у глобального скрипта нет места на странице',
    ],
  ])('%s — отказ', (_name, manifest, text) => {
    expect(problemsOf(manifest).some((message) => message.includes(text))).toBe(true);
  });
});
