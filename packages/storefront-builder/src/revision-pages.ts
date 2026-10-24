import { SPECIAL_PAGE_IDS, SPECIAL_PAGE_SLUGS, type RevisionPage } from '@merfy/storefront-build';
import { z } from 'zod';
import type { LogFields } from './log';

// Свои страницы магазина из ключа pages ревизии (блок 1 «Секций и SDK», часть 4, Р1-4-8). Строки пишет sites
// (PagesService): { id: page-custom-<uuid>, name, slug, role: "custom", isCustom: true, seo: null | { … }, … }. Во входы
// сборки идут id, адрес, имя и SEO своих страниц; строки главной и системных страниц — нет. Неверная строка, повтор
// id или адреса, занятые id и адрес — без неё, причина — в журнал: сборка идёт, страница не рендерится.
const PAGE_SLUG = /^\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_IDS: ReadonlySet<string> = new Set(['header', 'footer', ...SPECIAL_PAGE_IDS]);
const RESERVED_SLUGS: ReadonlySet<string> = new Set(['/theme-stand', ...SPECIAL_PAGE_SLUGS]);
const storedPage = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  slug: z.string().regex(PAGE_SLUG),
  name: z.string().max(200),
  seo: z.unknown(),
});

const isCustom = (value: unknown): boolean =>
  Reflect.get(Object(value), 'role') === 'custom' || Reflect.get(Object(value), 'isCustom') === true;

function seoText(seo: unknown, key: string): string {
  const value: unknown = Reflect.get(Object(seo), key);
  return typeof value === 'string' ? value : '';
}

export function revisionPagesOf(raw: readonly unknown[], invalid: (fields: LogFields) => void): RevisionPage[] {
  const pages: RevisionPage[] = [];
  for (const item of raw.filter(isCustom)) {
    const id = String(Reflect.get(Object(item), 'id'));
    const parsed = storedPage.safeParse(item);
    if (!parsed.success) {
      invalid({ id, problem: parsed.error.issues.map((issue) => issue.path.join('.')).join(', ') });
      continue;
    }
    const { slug, name, seo } = parsed.data;
    const taken = pages.some((page) => page.id === parsed.data.id || page.slug === slug);
    if (taken || RESERVED_IDS.has(parsed.data.id) || RESERVED_SLUGS.has(slug)) {
      invalid({ id, problem: 'id или адрес занят' });
      continue;
    }
    const pageSeo = {
      title: seoText(seo, 'title'),
      description: seoText(seo, 'description'),
      keywords: seoText(seo, 'keywords'),
    };
    pages.push({ id: parsed.data.id, slug, name, seo: pageSeo });
  }
  return pages;
}
