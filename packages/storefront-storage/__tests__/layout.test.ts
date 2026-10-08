import { describe, expect, it } from 'vitest';
import {
  STOREFRONT_PREFIX,
  blobKey,
  drawnKey,
  entitiesKey,
  hexOf,
  manifestKey,
  pointerKey,
  routesKey,
} from '../src/layout';

const SHOP = '00000000-0000-4000-8000-000000000001';
const HEX = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

describe('где что лежит', () => {
  it('всё под storefront/', () => {
    expect(STOREFRONT_PREFIX).toBe('storefront/');
  });

  it('файл — по отпечатку, первые два знака — папка', () => {
    expect(hexOf(`sha256:${HEX}`)).toBe(HEX);
    expect(blobKey(`sha256:${HEX}`)).toBe(`storefront/blobs/9f/${HEX}`);
  });

  it.each(['md5:abc', HEX, `sha256:${HEX.toUpperCase()}`])('«%s» — не отпечаток sha256', (hash) => {
    expect(() => blobKey(hash)).toThrow(`${hash}: ожидался хэш sha256:<64 знака hex>`);
  });

  it('манифест, таблица раздачи и список дорисовок — по магазину и сборке', () => {
    expect(manifestKey(SHOP, 41)).toBe(`storefront/manifests/${SHOP}/41.json`);
    expect(routesKey(SHOP, 41)).toBe(`storefront/routes/${SHOP}/41.json`);
    expect(drawnKey(SHOP, 41)).toBe(`storefront/drawn/${SHOP}/41.json`);
  });

  it('список адресов сущностей — по магазину, указатель — по метке хоста', () => {
    expect(entitiesKey(SHOP)).toBe(`storefront/entities/${SHOP}.json`);
    expect(pointerKey('scarf')).toBe('storefront/pointers/scarf.json');
  });

  it.each(['', 'a.b', '../x', 'Scarf'])('метка «%s» не подходит', (label) => {
    expect(() => pointerKey(label)).toThrow('метка хоста — a-z, 0-9 и дефис');
  });
});
