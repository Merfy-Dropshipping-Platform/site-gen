import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, parseDrawnList, parseEntityList, parsePointer, parseRoutesTable } from '../src/formats';
import { thrown } from './support';

const SHOP = '00000000-0000-4000-8000-000000000001';
const HEX = 'a'.repeat(64);
const POINTER = { v: 1, shop: SHOP, build: 41, newest: 41, rev: 41, paused: false, pending: null, history: [40, 39] };
const ROW = { h: HEX, t: 'text/html; charset=utf-8', c: 'revalidate', m: '2026-10-06T09:00:00.000Z' };
const TABLE = {
  v: 1,
  shop: SHOP,
  build: 41,
  versions: { render: `sha256:${'1'.repeat(64)}`, theme: 'nova@0.0.1' },
  notFound: null,
  files: { '/': ROW },
  moved: { '/products/old/': '/products/new/' },
  gone: { '/products/gone/': '2027-04-07T00:00:00.000Z' },
};
const LONG_HISTORY = Array.from({ length: HISTORY_LIMIT + 1 }, () => 1);

describe('указатель', () => {
  it('проходит схему', () => {
    expect(parsePointer(POINTER, 'pointers/scarf.json')).toEqual(POINTER);
  });

  it('на паузе — со сборкой, которая ждёт снятия паузы', () => {
    const paused = { ...POINTER, paused: true, pending: 42, newest: 42 };
    expect(parsePointer(paused, 'pointers/scarf.json')).toEqual(paused);
  });

  it.each([
    ['номер сборки не целый', { ...POINTER, build: 41.5 }, 'pointers/scarf.json#build'],
    ['ждущая сборка — не номер', { ...POINTER, pending: 0 }, 'pointers/scarf.json#pending'],
    ['лишнее поле', { ...POINTER, extra: 1 }, 'pointers/scarf.json#extra'],
    ['другая версия', { ...POINTER, v: 2 }, 'pointers/scarf.json#v'],
    ['история длиннее предела', { ...POINTER, history: LONG_HISTORY }, 'pointers/scarf.json#history'],
    ['не объект', '{}', 'pointers/scarf.json'],
  ])('%s — object-invalid с путём поля', (name, value, path) => {
    expect(thrown(() => parsePointer(value, 'pointers/scarf.json'))).toMatchObject({ code: 'object-invalid', path });
  });
});

describe('таблица раздачи', () => {
  it('проходит схему', () => {
    expect(parseRoutesTable(TABLE, 'routes/x/41.json')).toEqual(TABLE);
  });

  it.each([
    ['кэш не из списка', { ...TABLE, files: { '/': { ...ROW, c: 'forever' } } }, 'routes/x/41.json#files./.c'],
    ['путь без /', { ...TABLE, files: { about: ROW } }, 'routes/x/41.json#files.about'],
    ['дата удаления не ISO', { ...TABLE, gone: { '/x/': '7 апреля' } }, 'routes/x/41.json#gone./x/'],
    ['404 не отпечаток', { ...TABLE, notFound: 'abc' }, 'routes/x/41.json#notFound'],
  ])('%s — object-invalid', (name, value, path) => {
    expect(thrown(() => parseRoutesTable(value, 'routes/x/41.json'))).toMatchObject({ code: 'object-invalid', path });
  });
});

describe('списки', () => {
  it('список дорисовок — строки файлов по путям', () => {
    const list = { v: 1, rows: { '/products/osen/': ROW } };
    expect(parseDrawnList(list, 'drawn/x/41.json')).toEqual(list);
  });

  it('список адресов сущностей — пути', () => {
    const list = { v: 1, paths: ['/products/osen/'] };
    expect(parseEntityList(list, 'entities/x.json')).toEqual(list);
    expect(thrown(() => parseEntityList({ v: 1, paths: ['products'] }, 'entities/x.json'))).toMatchObject({
      path: 'entities/x.json#paths.0',
    });
  });
});
