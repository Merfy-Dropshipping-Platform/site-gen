import { FONT_REGISTRY } from '@merfy/storefront-build';
import { blobKey, type ObjectStore } from '@merfy/storefront-storage';

// Шрифты в превью (design.md блока 12, «решил сам» 10): превью — один HTML с адреса шлюза (inline-assets.ts), файлы
// /_fonts/… там не раздаются. В CSS шрифтов превью они встают data:-адресами; байты — из хранилища по отпечатку из
// реестра (файлы кладёт pnpm fonts:upload). Файла нет — ссылка остаётся: текст покажет подогнанный запасной шрифт.

const FONT_URL = /url\(\/(_fonts\/[^)]+\.woff2)\)/g;

// Байты файла шрифта по пути от корня сайта (_fonts/…); нет такого — null.
export type FontBytes = (path: string) => Promise<Uint8Array | null>;

const HASH_BY_PATH = new Map(
  Object.values(FONT_REGISTRY.fonts).flatMap((font) =>
    Object.values(font.subsets).flatMap((subset) =>
      Object.values(subset.files).map((file) => [file.path, file.hash] as const),
    ),
  ),
);

export const storeFontBytes =
  (store: ObjectStore): FontBytes =>
  async (path) => {
    const hash = HASH_BY_PATH.get(path);
    if (hash === undefined) return null;
    const stored = await store.read(blobKey(hash));
    return stored === null ? null : stored.body;
  };

const dataUrl = (bytes: Uint8Array): string => `data:font/woff2;base64,${Buffer.from(bytes).toString('base64')}`;

export async function inlineFonts(css: string, bytesOf: FontBytes): Promise<string> {
  const paths = [...new Set([...css.matchAll(FONT_URL)].map((match) => match[1]))];
  const found = await Promise.all(paths.map(async (path) => [path, await bytesOf(path)] as const));
  const urls = new Map(found.flatMap(([path, bytes]) => (bytes === null ? [] : [[path, dataUrl(bytes)] as const])));
  return css.replace(FONT_URL, (whole: string, path: string) => {
    const url = urls.get(path);
    return url === undefined ? whole : `url(${url})`;
  });
}
