import type { PageEntityType, PageRow, StorefrontManifest } from '@merfy/storefront-build';

// robots.txt и карта сайта магазина новой темы (design.md блока 5, раздел 4, «Удалённое, коды ответа и карта сайта»):
// публичные страницы из манифеста, lastmod — дата правки данных страницы (блок 4); отдельные файлы по типам, до 50 000
// адресов в файле; robots.txt ссылается на индекс. Магазин не для поиска (стенд) — Disallow: / и карты нет.
// Это файлы раздачи: в манифест блока 4 они не входят, их кладёт выкладка (задача 8).

export const SITEMAP_LIMIT = 50_000;
const ROBOTS = '/robots.txt';
const SITEMAP_INDEX = '/sitemap.xml';
const CLOSED_ROBOTS = 'User-agent: *\nDisallow: /\n';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>';
const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';

type SitemapGroup = 'pages' | 'products' | 'collections' | 'blog';
const GROUP_ORDER: readonly SitemapGroup[] = ['pages', 'products', 'collections', 'blog'];
// В какой файл карты идёт страница какой сущности; null — в карту не идёт. Новый тип сущности в блоке 4 без строки
// здесь не соберётся: Record требует ключ на каждый тип.
const SITEMAP_GROUPS: Record<PageEntityType, SitemapGroup | null> = {
  site: 'pages',
  policy: 'pages',
  contacts: 'pages',
  product: 'products',
  collection: 'collections',
  publication: 'blog',
  billing: null,
};
const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

export interface SeoRequest {
  manifest: StorefrontManifest;
  publicUrl: string;
  indexable: boolean;
}

// Путь раздачи и текст файла; тип содержимого — по пути (content-types.ts).
export interface SeoFile {
  path: string;
  text: string;
}

interface SitemapEntry {
  loc: string;
  lastmod: string;
}

const escapeXml = (text: string): string => text.replace(/[&<>"']/g, (char) => XML_ESCAPES[char]);
// Адрес страницы — абсолютный, путь в нём закодирован (кириллица, пробелы): так требует формат карты.
const urlOf = (publicUrl: string, path: string): string => new URL(path, publicUrl).href;
const chunkPath = (group: SitemapGroup, index: number): string =>
  index === 0 ? `/sitemap-${group}.xml` : `/sitemap-${group}-${index + 1}.xml`;
const latest = (entries: readonly SitemapEntry[]): string =>
  entries.reduce((last, entry) => (entry.lastmod > last ? entry.lastmod : last), '');

function chunksOf<T>(items: readonly T[], size: number): T[][] {
  const count = Math.ceil(items.length / size);
  return Array.from({ length: count }, (_, index) => items.slice(index * size, (index + 1) * size));
}

const xmlOf = (root: string, item: string, entries: readonly SitemapEntry[]): string =>
  [
    XML_HEAD,
    `<${root} xmlns="${SITEMAP_NS}">`,
    ...entries.map(
      (entry) => `<${item}><loc>${escapeXml(entry.loc)}</loc><lastmod>${entry.lastmod}</lastmod></${item}>`,
    ),
    `</${root}>`,
    '',
  ].join('\n');

function groupEntries(pages: readonly PageRow[], publicUrl: string): Map<SitemapGroup, SitemapEntry[]> {
  const groups = new Map<SitemapGroup, SitemapEntry[]>();
  const sorted = [...pages].sort((left, right) => (left.path < right.path ? -1 : 1));
  sorted.forEach((page) => {
    const group = SITEMAP_GROUPS[page.entity.type];
    if (group === null) return;
    const entries = groups.get(group) ?? [];
    entries.push({ loc: urlOf(publicUrl, page.path), lastmod: page.dataUpdatedAt });
    groups.set(group, entries);
  });
  return groups;
}

function sitemapFiles(manifest: StorefrontManifest, publicUrl: string): SeoFile[] {
  const groups = groupEntries(manifest.pages, publicUrl);
  const chunks = GROUP_ORDER.flatMap((group) =>
    chunksOf(groups.get(group) ?? [], SITEMAP_LIMIT).map((entries, index) => ({
      path: chunkPath(group, index),
      entries,
    })),
  );
  const indexEntries = chunks.map((chunk) => ({ loc: urlOf(publicUrl, chunk.path), lastmod: latest(chunk.entries) }));
  const index = { path: SITEMAP_INDEX, text: xmlOf('sitemapindex', 'sitemap', indexEntries) };
  return [index, ...chunks.map((chunk) => ({ path: chunk.path, text: xmlOf('urlset', 'url', chunk.entries) }))];
}

export function seoFiles(request: SeoRequest): SeoFile[] {
  if (!request.indexable) return [{ path: ROBOTS, text: CLOSED_ROBOTS }];
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${urlOf(request.publicUrl, SITEMAP_INDEX)}\n`;
  return [{ path: ROBOTS, text: robots }, ...sitemapFiles(request.manifest, request.publicUrl)];
}
