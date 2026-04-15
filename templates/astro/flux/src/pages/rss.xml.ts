import rss from '@astrojs/rss';
import type { APIContext } from 'astro';

// @ts-ignore — generated at build time
import publications from '../data/publications.json';
// @ts-ignore — generated at build time
import siteConfig from '../data/site-config.json';

export function GET(context: APIContext) {
  const config = siteConfig as any;
  const siteTitle = config?.siteName || config?.title || 'Мой магазин';
  const siteUrl = context.site?.toString() || config?.siteUrl || 'https://example.com';

  const posts = (publications || [])
    .filter((p: any) => p.status === 'published')
    .sort((a: any, b: any) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return rss({
    title: `${siteTitle} — Блог`,
    description: `Блог магазина ${siteTitle}`,
    site: siteUrl,
    items: posts.map((post: any) => ({
      title: post.title,
      pubDate: new Date(post.publishedAt),
      description: post.excerpt || '',
      link: `/blog/${post.slug}`,
    })),
  });
}
