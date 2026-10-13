import { TokenError } from '../errors';

// Чтение файла WOFF2 (https://www.w3.org/TR/WOFF2/) — ровно то, что нужно скрипту библиотеки шрифтов (блок 12): размеры
// для подгонки запасного шрифта («решил сам» 12) и какие символы есть в файле (кириллица по файлу, «решил сам» 4).
// Таблицы cmap, head, hhea и hmtx в WOFF2 лежат как есть — их читаем; glyf и loca сжаты особо — их не трогаем.
// Распаковка brotli — снаружи (node:zlib у скрипта): функция чистая и работает с байтами.

export type Brotli = (compressed: Uint8Array) => Uint8Array;

export interface FontFacts {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  lineGap: number;
  // Номер глифа символа; 0 — символа в файле нет.
  glyphOf: (codePoint: number) => number;
  advanceOf: (glyph: number) => number;
}

const SIGNATURE = 0x774f4632; // «wOF2»
const HEADER_BYTES = 48;
const ARBITRARY_TAG = 63;
// Номера таблиц в каталоге WOFF2: нужны только эти четыре; glyf и loca — чтобы понять, сжаты ли они особо.
const KNOWN_TAGS: Readonly<Record<number, string>> = {
  0: 'cmap',
  1: 'head',
  2: 'hhea',
  3: 'hmtx',
  10: 'glyf',
  11: 'loca',
};
const NULL_TRANSFORM_GLYF = 3;

interface TableEntry {
  tag: string;
  length: number;
}

interface Cursor {
  view: DataView;
  offset: number;
}

const fail = (problem: string): never => {
  throw new TokenError('fonts-invalid', [`файл шрифта: ${problem}`]);
};

// UIntBase128 (WOFF2, 5.1): до пяти байт по 7 бит.
function readBase128(cursor: Cursor): number {
  let value = 0;
  for (let index = 0; index < 5; index += 1) {
    const byte = cursor.view.getUint8(cursor.offset);
    cursor.offset += 1;
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  return fail('неверное число UIntBase128');
}

const isTransformed = (tag: string, version: number): boolean =>
  tag === 'glyf' || tag === 'loca' ? version !== NULL_TRANSFORM_GLYF : version !== 0;

function readTableEntry(cursor: Cursor): TableEntry {
  const flags = cursor.view.getUint8(cursor.offset);
  cursor.offset += 1;
  const tagIndex = flags & 0x3f;
  const arbitrary = tagIndex === ARBITRARY_TAG;
  const tag = arbitrary ? String(cursor.view.getUint32(cursor.offset)) : (KNOWN_TAGS[tagIndex] ?? String(tagIndex));
  cursor.offset += arbitrary ? 4 : 0;
  const origLength = readBase128(cursor);
  const transformed = isTransformed(tag, flags >> 6);
  const length = transformed ? readBase128(cursor) : origLength;
  if (transformed && tag === 'hmtx') fail('таблица hmtx сжата особо — такой файл скрипт не читает');
  return { tag, length };
}

// Таблицы из распакованного потока: подряд, в порядке каталога, без выравнивания.
function readTables(bytes: Uint8Array, brotli: Brotli): Map<string, DataView> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== SIGNATURE) fail('это не WOFF2');
  const cursor: Cursor = { view, offset: HEADER_BYTES };
  const entries = Array.from({ length: view.getUint16(12) }, () => readTableEntry(cursor));
  const stream = brotli(bytes.subarray(cursor.offset, cursor.offset + view.getUint32(20)));
  const tables = new Map<string, DataView>();
  let start = 0;
  entries.forEach((entry) => {
    tables.set(entry.tag, new DataView(stream.buffer, stream.byteOffset + start, entry.length));
    start += entry.length;
  });
  return tables;
}

const tableOf = (tables: Map<string, DataView>, tag: string): DataView => tables.get(tag) ?? fail(`нет таблицы ${tag}`);

// cmap, формат 4: отрезки символов (2 байта).
function format4(table: DataView, at: number): (codePoint: number) => number {
  const segments = table.getUint16(at + 6) / 2;
  const ends = at + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const ranges = deltas + segments * 2;
  return (codePoint) => {
    const segment = Array.from({ length: segments }, (_, index) => index).find(
      (index) => table.getUint16(ends + index * 2) >= codePoint,
    );
    if (segment === undefined || table.getUint16(starts + segment * 2) > codePoint) return 0;
    const delta = table.getInt16(deltas + segment * 2);
    const rangeAt = ranges + segment * 2;
    const rangeOffset = table.getUint16(rangeAt);
    if (rangeOffset === 0) return (codePoint + delta) & 0xffff;
    const glyph = table.getUint16(rangeAt + rangeOffset + (codePoint - table.getUint16(starts + segment * 2)) * 2);
    return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
  };
}

// cmap, формат 12: группы символов (4 байта).
function format12(table: DataView, at: number): (codePoint: number) => number {
  const groups = Array.from({ length: table.getUint32(at + 12) }, (_, index) => at + 16 + index * 12);
  return (codePoint) => {
    const group = groups.find(
      (offset) => table.getUint32(offset) <= codePoint && codePoint <= table.getUint32(offset + 4),
    );
    return group === undefined ? 0 : table.getUint32(group + 8) + codePoint - table.getUint32(group);
  };
}

const CMAP_FORMATS: Readonly<Record<number, (table: DataView, at: number) => (codePoint: number) => number>> = {
  12: format12,
  4: format4,
};
// Сначала полный Юникод (формат 12), потом основная плоскость (формат 4).
const FORMAT_ORDER = [12, 4];

function cmapOf(table: DataView): (codePoint: number) => number {
  const offsets = Array.from({ length: table.getUint16(2) }, (_, index) => table.getUint32(4 + index * 8 + 4));
  const format = FORMAT_ORDER.find((wanted) => offsets.some((at) => table.getUint16(at) === wanted));
  const at = offsets.find((offset) => table.getUint16(offset) === format);
  if (format === undefined || at === undefined) return fail('в cmap нет таблицы формата 4 или 12');
  return CMAP_FORMATS[format](table, at);
}

function advancesOf(hhea: DataView, hmtx: DataView): (glyph: number) => number {
  const count = hhea.getUint16(34);
  return (glyph) => hmtx.getUint16(Math.min(glyph, count - 1) * 4);
}

export function readFontFile(bytes: Uint8Array, brotli: Brotli): FontFacts {
  const tables = readTables(bytes, brotli);
  const hhea = tableOf(tables, 'hhea');
  return {
    unitsPerEm: tableOf(tables, 'head').getUint16(18),
    ascent: hhea.getInt16(4),
    descent: hhea.getInt16(6),
    lineGap: hhea.getInt16(8),
    glyphOf: cmapOf(tableOf(tables, 'cmap')),
    advanceOf: advancesOf(hhea, tableOf(tables, 'hmtx')),
  };
}
