import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { brotliDecompressSync } from 'node:zlib';
import { z } from 'zod';
import { readFontFile } from '../src/fonts/font-file';
import { fontEntry, fontRegistry, parseFontLibrary, type FontPin, type SourceFile } from '../src/fonts/library';
import type { FontEntry } from '../src/fonts/registry';

// pnpm fonts:library [--only ключ,ключ] [--out файл] — реестр шрифтов (design.md блока 12, «решил сам» 4, 6, 12) из
// пакетов Fontsource закреплённой версии: список и версии — packages/theme-contract/fonts/library.json, итог —
// packages/theme-contract/fonts/fonts.json. Файлы берутся с jsDelivr (зеркало npm) по точной версии; отпечаток каждого
// сверяется со списком файлов пакета у jsDelivr. Сеть — только здесь; сборка магазина читает готовый реестр.

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FONTS_DIR = resolve(PACKAGE_DIR, '../theme-contract/fonts');
const CDN = 'https://cdn.jsdelivr.net/npm';
const LISTING = 'https://data.jsdelivr.com/v1/packages/npm';
// Файлы нормального начертания: ось wght у переменных пакетов, насыщенности 100…900 у статичных. Курсив не берём.
const FACE_FILE = /^files\/[a-z0-9-]+-(?:wght|[1-9]00)-normal\.woff2$/;

const listingSchema = z.object({
  files: z.array(z.object({ name: z.string(), hash: z.string(), size: z.int() })),
});
type Listed = z.infer<typeof listingSchema>['files'][number];

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ответ ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

const fetchText = async (url: string): Promise<string> => new TextDecoder().decode(await fetchBytes(url));
const fetchJson = async (url: string): Promise<unknown> => JSON.parse(await fetchText(url));
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

// Файл пакета: байты сверяются с отпечатком из списка jsDelivr (sha256 в base64).
async function sourceFile(pin: FontPin, listed: Listed): Promise<[string, SourceFile]> {
  const bytes = await fetchBytes(`${CDN}/${pin.package}@${pin.version}${listed.name}`);
  const hex = sha256(bytes);
  if (Buffer.from(hex, 'hex').toString('base64') !== listed.hash)
    throw new Error(`${pin.package}@${pin.version}${listed.name}: отпечаток не совпал со списком пакета`);
  const facts = readFontFile(bytes, (compressed) => new Uint8Array(brotliDecompressSync(compressed)));
  return [listed.name.slice(1), { hash: `sha256:${hex}`, bytes: bytes.length, facts }];
}

async function readFont(key: string, pin: FontPin): Promise<FontEntry> {
  const base = `${CDN}/${pin.package}@${pin.version}`;
  const listing = listingSchema.parse(await fetchJson(`${LISTING}/${pin.package}@${pin.version}?structure=flat`));
  const wanted = listing.files.filter((file) => FACE_FILE.test(file.name.slice(1)));
  const [metadata, unicode, licenseText, files] = await Promise.all([
    fetchJson(`${base}/metadata.json`),
    fetchJson(`${base}/unicode.json`),
    fetchText(`${base}/LICENSE`),
    Promise.all(wanted.map((file) => sourceFile(pin, file))),
  ]);
  return fontEntry({ key, pin, metadata, unicode, licenseText, files: new Map(files) });
}

function summary(entries: ReadonlyMap<string, FontEntry>, text: string): string {
  const fonts = [...entries.values()];
  const files = fonts.flatMap((font) => Object.values(font.subsets).flatMap((subset) => Object.values(subset.files)));
  const noCyrillic = [...entries.keys()].filter((key) => entries.get(key)?.cyrillic === false);
  return [
    `шрифтов ${fonts.length}, переменных ${fonts.filter((font) => font.axes !== null).length}`,
    `файлов ${files.length}, байт ${files.reduce((sum, file) => sum + file.bytes, 0)}`,
    `без кириллицы: ${noCyrillic.join(', ') || 'нет'}`,
    `зарезервированное имя: ${fonts.filter((font) => font['reserved-name']).length}`,
    `отпечаток реестра: sha256:${sha256(new TextEncoder().encode(text))}`,
  ].join('\n');
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { only: { type: 'string' }, out: { type: 'string' } } });
  const raw: unknown = JSON.parse(readFileSync(resolve(FONTS_DIR, 'library.json'), 'utf8'));
  const library = parseFontLibrary(raw);
  const only = values.only?.split(',') ?? Object.keys(library.fonts);
  const entries = new Map<string, FontEntry>();
  for (const key of only) {
    if (!(key in library.fonts)) throw new Error(`шрифта ${key} нет в library.json`);
    entries.set(key, await readFont(key, library.fonts[key]));
  }
  const text = `${JSON.stringify(fontRegistry(entries), null, 2)}\n`;
  const out = resolve(values.out ?? resolve(FONTS_DIR, 'fonts.json'));
  writeFileSync(out, text);
  process.stdout.write(`записан ${out}\n${summary(entries, text)}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
