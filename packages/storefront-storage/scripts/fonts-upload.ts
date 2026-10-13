import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { FONT_REGISTRY, sha256, type BuildFile, type FontFileEntry } from '@merfy/storefront-build';
import { blobKey } from '../src/layout';
import { createS3Store } from '../src/s3-store';
import { uploadFiles } from '../src/upload';
import { s3FromEnv } from './s3-env';

// pnpm fonts:upload [--only ключ,ключ] [--to-dir папка] — файлы библиотеки шрифтов (design.md блока 12, «решил сам» 6):
// один раз на контур кладёт файлы реестра в хранилище по отпечатку (storefront/blobs/…), сборка магазина только
// вписывает их в манифест. Байты — с jsDelivr по пакету и версии из реестра; отпечаток каждого сверяется с реестром.
// Уже лежащие файлы не льются. --to-dir — те же файлы в папку по их путям (_fonts/…): так их раздаёт стенд темы.

const CDN = 'https://cdn.jsdelivr.net/npm';
// Сколько файлов качаем одновременно.
const DOWNLOADS_AT_ONCE = 8;

interface LibraryFile {
  entry: FontFileEntry;
  url: string;
}

function libraryFiles(only: readonly string[] | undefined): LibraryFile[] {
  const keys = only ?? Object.keys(FONT_REGISTRY.fonts);
  const unknown = keys.filter((key) => !(key in FONT_REGISTRY.fonts));
  if (unknown.length > 0) throw new Error(`шрифтов нет в реестре: ${unknown.join(', ')}`);
  return keys.flatMap((key) => {
    const font = FONT_REGISTRY.fonts[key];
    const entries = Object.values(font.subsets).flatMap((subset) => Object.values(subset.files));
    return entries.map((entry) => ({ entry, url: `${CDN}/${font.package}@${font.version}/${entry.source}` }));
  });
}

async function download(file: LibraryFile): Promise<BuildFile> {
  const response = await fetch(file.url);
  if (!response.ok) throw new Error(`${file.url}: ответ ${response.status}`);
  const content = new Uint8Array(await response.arrayBuffer());
  if (sha256(content) !== file.entry.hash) throw new Error(`${file.url}: отпечаток не совпал с реестром`);
  return { path: file.entry.path, content };
}

async function downloadAll(files: readonly LibraryFile[]): Promise<BuildFile[]> {
  const result: BuildFile[] = [];
  for (let start = 0; start < files.length; start += DOWNLOADS_AT_ONCE) {
    result.push(...(await Promise.all(files.slice(start, start + DOWNLOADS_AT_ONCE).map(download))));
  }
  return result;
}

async function toStore(files: readonly LibraryFile[]): Promise<string> {
  const store = createS3Store(s3FromEnv());
  const present = await Promise.all(files.map((file) => store.has(blobKey(file.entry.hash))));
  const missing = files.filter((_, index) => !present[index]);
  await uploadFiles(store, await downloadAll(missing));
  return `файлов ${files.length}, уже лежали ${files.length - missing.length}, залито ${missing.length}`;
}

async function toDir(files: readonly LibraryFile[], dir: string): Promise<string> {
  const downloaded = await downloadAll(files);
  for (const file of downloaded) {
    await mkdir(dirname(join(dir, file.path)), { recursive: true });
    await writeFile(join(dir, file.path), file.content);
  }
  return `записано в ${dir}: ${downloaded.length}`;
}

const { values } = parseArgs({ options: { only: { type: 'string' }, 'to-dir': { type: 'string' } } });
try {
  const files = libraryFiles(values.only?.split(','));
  const dir = values['to-dir'];
  process.stdout.write(`${dir === undefined ? await toStore(files) : await toDir(files, resolve(dir))}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
