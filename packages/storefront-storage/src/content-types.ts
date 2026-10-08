import type { CacheClass } from './formats';

// Тип содержимого и кэш файла сборки — по пути (design.md блока 5, раздел 4, «Проверка перед переключением и кэш»).
// Раздача ставит их из таблицы раздачи, а не из хранилища. Расширения нет в списке — application/octet-stream.
const CONTENT_TYPES = new Map<string, string>([
  ['html', 'text/html; charset=utf-8'],
  ['css', 'text/css; charset=utf-8'],
  ['js', 'text/javascript; charset=utf-8'],
  ['mjs', 'text/javascript; charset=utf-8'],
  ['json', 'application/json'],
  ['map', 'application/json'],
  ['webmanifest', 'application/manifest+json'],
  ['xml', 'application/xml; charset=utf-8'],
  ['txt', 'text/plain; charset=utf-8'],
  ['svg', 'image/svg+xml'],
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
  ['avif', 'image/avif'],
  ['gif', 'image/gif'],
  ['ico', 'image/x-icon'],
  ['woff', 'font/woff'],
  ['woff2', 'font/woff2'],
  ['ttf', 'font/ttf'],
  ['otf', 'font/otf'],
]);
export const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

// Файлы с отпечатком в имени Astro кладёт в _astro/: им кэш навсегда, остальным — no-cache с ETag. Нынешний путь
// отдаёт _astro/ с no-cache (design.md, факт 3). Каркас (блок 7) добавит сюда свою папку.
const IMMUTABLE_PREFIXES = ['_astro/'];

function extensionOf(filePath: string): string {
  const name = filePath.slice(filePath.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot < 1 ? '' : name.slice(dot + 1).toLowerCase();
}

export const contentTypeOf = (filePath: string): string =>
  CONTENT_TYPES.get(extensionOf(filePath)) ?? DEFAULT_CONTENT_TYPE;

export const cacheClassOf = (filePath: string): CacheClass =>
  IMMUTABLE_PREFIXES.some((prefix) => filePath.startsWith(prefix)) ? 'immutable' : 'revalidate';
