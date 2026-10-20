/**
 * Страницы блога на витрине (PUB-1, PUB-2) — план и запись в дист.
 *
 * Тот же механизм, что у товаров и коллекций на themes-v2: системная страница
 * ревизии («Блог» `page-blog`, «Запись блога» `page-blog-post`) — шаблон, а
 * сборка кладёт по копии на каждый блог `/blogs/{handle}` и каждую
 * опубликованную запись `/blogs/{handle}/{slug}`, подставляя в секцию тела
 * блог или запись и патча SEO-мету страницы (как patchPdpMetaTags у товара).
 * Рендер копий — composeBlogPagesIntoDist в v2-live-pages.ts.
 *
 * Старые адреса — страницы-переадресации, как catalog-redirects.ts у
 * коллекций (раздача — статика MinIO за nginx, своих правил переадресации на
 * магазин у неё нет): `/publication/{slug}`, `/publications/{slug}`, прежние
 * адреса из publication_redirects и `/blog` → блог по умолчанию. Архивная
 * запись — страница «запись больше недоступна» с noindex по всем её адресам.
 *
 * Адреса строит только publicationUrl / blogUrl из theme-base.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { blogUrl, publicationUrl } from '../../packages/theme-base/runtime/publications';
import { escapeHtml } from '../generator/seo-meta';
import type { CatalogPublication } from '../render/catalog';

/** Блог по умолчанию у каждого магазина. */
export const DEFAULT_BLOG_HANDLE = 'novosti';

export type BlogRow = { id: string; handle: string; title: string };
/** Снятая с публикации (архивная) запись — её адреса отвечают «недоступна». */
export type ArchivedPublicationRow = { id: string; slug: string; blogHandle: string };
/** Прежний адрес записи (publication_redirects). */
export type PublicationRedirectRow = { oldPath: string; publicationId: string };

export interface BlogRouteData {
  /** Блоги магазина по дате создания (первый — блог по умолчанию, если нет «Новостей»). */
  blogs: BlogRow[];
  /** Опубликованные записи (поля каталога: анонс — уже автоанонс, если продавец не задал). */
  publications: CatalogPublication[];
  archived: ArchivedPublicationRow[];
  redirects: PublicationRedirectRow[];
}

export interface BlogPageMeta {
  title: string;
  description?: string;
  image?: string;
  /** Канонический адрес страницы от корня. */
  path: string;
}

export interface BlogPagePlan {
  /** Путь в дисте без ведущего слэша: `blogs/{handle}[/{slug}]`. */
  route: string;
  pageKey: 'page-blog' | 'page-blog-post';
  /** Что сборка кладёт в пропсы секции тела страницы. */
  props: Record<string, string>;
  meta: BlogPageMeta;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Страницы блогов (и пустых тоже) и опубликованных записей. */
export function planBlogPages(data: BlogRouteData): BlogPagePlan[] {
  const blogs: BlogPagePlan[] = data.blogs
    .filter((b) => text(b.handle))
    .map((b) => ({
      route: blogUrl(b.handle).slice(1),
      pageKey: 'page-blog',
      props: { blogHandle: b.handle, blogTitle: b.title },
      meta: { title: b.title, path: blogUrl(b.handle) },
    }));
  const posts: BlogPagePlan[] = data.publications
    .filter((p) => text(p.blogHandle) && text(p.slug))
    .map((p) => {
      const url = publicationUrl(p.blogHandle, p.slug);
      return {
        route: url.slice(1),
        pageKey: 'page-blog-post',
        props: { publicationId: p.id },
        meta: {
          // Пустые SEO-поля → заголовок и (авто)анонс записи.
          title: text(p.seoTitle) || p.title,
          ...(text(p.seoDescription) || text(p.excerpt)
            ? { description: text(p.seoDescription) || text(p.excerpt) }
            : {}),
          ...(p.coverImageUrl ? { image: p.coverImageUrl } : {}),
          path: url,
        },
      };
    });
  return [...blogs, ...posts];
}

export interface BlogRedirectPlan {
  moved: Array<{ from: string; to: string }>;
  gone: string[];
}

/** Переадресации старых адресов и адреса архивных записей. */
export function planBlogRedirects(data: BlogRouteData): BlogRedirectPlan {
  const live = new Set(planBlogPages(data).map((p) => p.meta.path));
  const byId = new Map(data.publications.map((p) => [p.id, p]));
  const moved = new Map<string, string>();
  const add = (from: string, to: string) => {
    if (from && from !== to && !live.has(from) && !moved.has(from)) moved.set(from, to);
  };

  for (const p of data.publications) {
    if (!text(p.slug) || !text(p.blogHandle)) continue;
    const url = publicationUrl(p.blogHandle, p.slug);
    add(`/publication/${p.slug}`, url);
    add(`/publications/${p.slug}`, url);
  }
  for (const r of data.redirects) {
    const p = byId.get(r.publicationId);
    if (p) add(r.oldPath, publicationUrl(p.blogHandle, p.slug));
  }
  const byDefault =
    data.blogs.find((b) => b.handle === DEFAULT_BLOG_HANDLE) ?? data.blogs.find((b) => text(b.handle));
  if (byDefault) add('/blog', blogUrl(byDefault.handle));

  const gone = new Set<string>();
  for (const a of data.archived) {
    const paths = [
      publicationUrl(a.blogHandle, a.slug),
      `/publication/${a.slug}`,
      `/publications/${a.slug}`,
      ...data.redirects.filter((r) => r.publicationId === a.id).map((r) => r.oldPath),
    ];
    for (const p of paths) if (!live.has(p) && !moved.has(p)) gone.add(p);
  }

  return {
    moved: [...moved].map(([from, to]) => ({ from, to })),
    gone: [...gone],
  };
}

const replaceAttr = (html: string, re: RegExp, value: string): string =>
  html.replace(re, `$1${escapeHtml(value)}$2`);

/**
 * SEO-мета страницы блога или записи: <title>, description, og/twitter,
 * canonical. Пустое поле не трогаем — остаётся мета шелла, без пустых тегов.
 */
export function patchBlogPageMeta(html: string, meta: BlogPageMeta, pub: string): string {
  let out = html;
  if (meta.title) {
    out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(meta.title)}</title>`);
    for (const prop of ['og:title', 'twitter:title']) {
      out = replaceAttr(
        out,
        new RegExp(`(<meta\\b[^>]*\\bproperty=["']${prop}["'][^>]*\\bcontent=["'])[^"']*(["'])`, 'i'),
        meta.title,
      );
    }
  }
  if (meta.description) {
    out = replaceAttr(
      out,
      /(<meta\b[^>]*\bname=["']description["'][^>]*\bcontent=["'])[^"']*(["'])/i,
      meta.description,
    );
    for (const prop of ['og:description', 'twitter:description']) {
      out = replaceAttr(
        out,
        new RegExp(`(<meta\\b[^>]*\\bproperty=["']${prop}["'][^>]*\\bcontent=["'])[^"']*(["'])`, 'i'),
        meta.description,
      );
    }
  }
  if (meta.image) {
    for (const prop of ['og:image', 'twitter:image']) {
      out = replaceAttr(
        out,
        new RegExp(`(<meta\\b[^>]*\\bproperty=["']${prop}["'][^>]*\\bcontent=["'])[^"']*(["'])`, 'i'),
        meta.image,
      );
    }
  }
  const origin = pub.replace(/\/+$/, '');
  if (origin) {
    const canonical = `${origin}${meta.path}`;
    out = replaceAttr(out, /(<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["'])[^"']*(["'])/i, canonical);
    for (const prop of ['og:url', 'twitter:url']) {
      out = replaceAttr(
        out,
        new RegExp(`(<meta\\b[^>]*\\bproperty=["']${prop}["'][^>]*\\bcontent=["'])[^"']*(["'])`, 'i'),
        canonical,
      );
    }
  }
  return out;
}

/** Путь от корня → файл в дисте; всё, что может выйти из диста, отсекается. */
function distFileFor(distDir: string, urlPath: string): string | null {
  if (!/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/?$/.test(urlPath)) return null;
  return path.join(distDir, urlPath.replace(/^\/+|\/+$/g, ''), 'index.html');
}

/**
 * Страница-переадресация: refresh работает без JS, скрипт переносит query и
 * hash, canonical уводит вес на новый адрес (как renderCatalogRedirectHtml).
 */
export function renderBlogRedirectHtml(target: string, publicUrl: string): string {
  const origin = publicUrl.replace(/\/+$/, '');
  const canonical = origin ? `${origin}${target}` : target;
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Переадресация</title>
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta http-equiv="refresh" content="0; url=${escapeHtml(target)}">
<script>location.replace(${JSON.stringify(target)} + location.search + location.hash);</script>
</head>
<body>
<p><a href="${escapeHtml(target)}">Перейти</a></p>
</body>
</html>
`;
}

/** Страница архивной записи: noindex, без содержимого записи. */
export function renderBlogGoneHtml(): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Запись больше недоступна</title>
</head>
<body>
<main style="max-width:640px;margin:80px auto;padding:0 16px;font-family:system-ui,sans-serif">
<h1>Запись больше недоступна</h1>
<p>Магазин снял её с публикации. <a href="/">На главную</a></p>
</main>
</body>
</html>
`;
}

/**
 * Пишет переадресации и страницы недоступных записей. Существующий файл
 * (живая страница) сильнее — не перезаписывается.
 */
export async function writeBlogRedirectsIntoDist(
  distDir: string,
  plan: BlogRedirectPlan,
  publicUrl: string,
): Promise<{ moved: number; gone: number; skipped: number }> {
  const result = { moved: 0, gone: 0, skipped: 0 };
  const write = async (urlPath: string, html: string): Promise<boolean> => {
    const file = distFileFor(distDir, urlPath);
    if (!file) return false;
    const exists = await fs
      .access(file)
      .then(() => true)
      .catch(() => false);
    if (exists) return false;
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, html, 'utf8');
    return true;
  };
  for (const { from, to } of plan.moved) {
    if (await write(from, renderBlogRedirectHtml(to, publicUrl))) result.moved++;
    else result.skipped++;
  }
  const gone = renderBlogGoneHtml();
  for (const urlPath of plan.gone) {
    if (await write(urlPath, gone)) result.gone++;
    else result.skipped++;
  }
  return result;
}
