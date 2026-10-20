/**
 * Сидер системных страниц «Блог» и «Запись блога» (PUB-1, PUB-2).
 *
 * Манифесты пяти тем объявляют `page-blog` (`/blogs/preview`) и
 * `page-blog-post` (`/blogs/preview/post`), но `runMigrations` домерживает
 * страницы манифеста только при подъёме ревизии 1.0 → 2.0; у живых сайтов
 * ревизия уже 2.0, поэтому записи досеваем здесь — тем же приёмом, что
 * `seedWishlistPage`.
 *
 * Содержимое — [Header, секция страницы, Footer]: тело — одна секция
 * («Блог» / «Запись блога»), вокруг мерчант добавляет свои секции. Шапка и
 * подвал — главной (getHomeChrome), свои детерминированные id.
 *
 * Идемпотентна: страница с записью И контентом не трогается, правки мерчанта
 * переживают любой повторный прогон.
 */

import type { PageData } from "./types";
import { getHomeChrome } from "./shared-chrome";

type BlogPageSpec = {
  id: string;
  name: string;
  slug: string;
  contentFile: string;
  block: string;
  suffix: string;
};

const BLOG_PAGES: readonly BlogPageSpec[] = [
  {
    id: "page-blog",
    name: "Блог",
    slug: "/blogs/preview",
    contentFile: "pages/blog.json",
    block: "BlogSection",
    suffix: "blog",
  },
  {
    id: "page-blog-post",
    name: "Запись блога",
    slug: "/blogs/preview/post",
    contentFile: "pages/blog-post.json",
    block: "BlogPostSection",
    suffix: "blog-post",
  },
];

function seedOne(
  out: Record<string, unknown>,
  spec: BlogPageSpec,
): Record<string, unknown> {
  // Пустая ревизия (без pagesData) — заглушка, а не сайт: не создаём pagesData
  // на ровном месте (`migrateRevisionData({})` остаётся тождественной).
  if (!out.pagesData || typeof out.pagesData !== "object") return out;
  const pagesData = out.pagesData as Record<string, unknown>;
  const pages = Array.isArray(out.pages)
    ? (out.pages as Array<{ id?: string; slug?: string }>)
    : [];
  const bare = spec.slug.replace(/^\/+|\/+$/g, "");
  const hasContent = !!pagesData[spec.id];
  const hasMeta = pages.some(
    (p) => p?.id === spec.id || (p?.slug ?? "").replace(/^\/+|\/+$/g, "") === bare,
  );
  if (hasContent && hasMeta) return out;

  const chrome = getHomeChrome(pagesData);
  const newPagesData = hasContent
    ? pagesData
    : {
        ...pagesData,
        [spec.id]: {
          content: [
            {
              ...chrome.headerBlock,
              props: { ...(chrome.headerBlock.props ?? {}), id: `Header-${spec.suffix}` },
            },
            {
              type: spec.block,
              props: {
                id: `${spec.block}-1`,
                colorScheme: 2,
                padding: { top: 80, bottom: 80 },
              },
            },
            {
              ...chrome.footerBlock,
              props: { ...(chrome.footerBlock.props ?? {}), id: `Footer-${spec.suffix}` },
            },
          ],
          root: { props: { title: spec.name } },
          zones: {},
        } as PageData,
      };
  const newPages = hasMeta
    ? pages
    : [
        ...pages,
        {
          id: spec.id,
          name: spec.name,
          slug: spec.slug,
          role: "system",
          contentFile: spec.contentFile,
        },
      ];
  return { ...out, pages: newPages, pagesData: newPagesData };
}

/** Досев страниц «Блог» и «Запись блога» (обе — для всех тем). */
export function seedBlogPages(
  out: Record<string, unknown>,
): Record<string, unknown> {
  return BLOG_PAGES.reduce((doc, spec) => seedOne(doc, spec), out);
}
