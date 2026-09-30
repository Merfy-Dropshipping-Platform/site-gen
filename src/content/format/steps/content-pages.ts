/**
 * Часть R4 (таблица шагов миграции ревизии, разбор `revision-migrations.ts`).
 * Перенесено дословно из старого файла — построчная вырезка, без правок логики.
 *
 * Миграция контентных страниц (не системных).
 */

import type { Block, PageData } from './types';

/**
 * Контент-страницы (about/delivery/contacts) должны быть чистой страницей с
 * секцией Page. Старый конструкторский fallback `|| initialData` запекал в них
 * ДОМАШНИЙ шаблон (PromoBanner/Hero/Collections/PopularProducts/Newsletter).
 * Эта миграция заменяет такой home-junk на чистую [Header(home), Page, Footer(home)]
 * со СТАБИЛЬНЫМ id (`Page-<slug>`) — детерминированно на getRevision/preview/build,
 * без churn. Мерчант-контент (есть блок Page или иной набор) и отсутствующие
 * страницы НЕ трогает (replace-junk-only). Идемпотентна.
 *
 * Зеркало конструкторского `seedContentPages` (pupaMigrate.ts). Восстанавливает
 * гарантию, снятую конструкторским `eb8e480` (2026-06-08).
 */
const CONTENT_PAGE_TITLES: Record<string, string> = {
  'page-about': 'О нас',
  'page-delivery': 'Доставка',
  'page-contacts': 'Контакты',
};

// Типы блоков домашнего шаблона (initialData конструктора). Контент-страница
// РОВНО с этим набором и БЕЗ блока Page = «нейрослоп» (fallback на home), а не
// намеренный контент мерчанта.
const CONTENT_HOME_JUNK_TYPES = [
  'PromoBanner',
  'Header',
  'Hero',
  'Collections',
  'PopularProducts',
  'ImageWithText',
  'Newsletter',
  'Footer',
];

function isContentPageHomeJunk(content: Block[]): boolean {
  const types = content.map((b) => b?.type).filter(Boolean) as string[];
  if (types.includes('Page')) return false;
  if (types.length !== CONTENT_HOME_JUNK_TYPES.length) return false;
  return types.every((t, i) => t === CONTENT_HOME_JUNK_TYPES[i]);
}

export function migrateContentPages(pagesData: Record<string, unknown>): Record<string, unknown> {
  const home = pagesData['home'] as PageData | undefined;
  const homeContent: Block[] = Array.isArray(home?.content) ? (home!.content as Block[]) : [];
  const headerBlock = homeContent.find((b) => b?.type === 'Header');
  const footerBlock = homeContent.find((b) => b?.type === 'Footer');

  let changed = false;
  const out: Record<string, unknown> = { ...pagesData };
  for (const [pageId, title] of Object.entries(CONTENT_PAGE_TITLES)) {
    const existing = out[pageId] as PageData | undefined;
    const content = Array.isArray(existing?.content) ? (existing!.content as Block[]) : null;
    // replace-junk-only: отсутствующие и мерчант-страницы не трогаем.
    if (!content || content.length === 0) continue;
    if (!isContentPageHomeJunk(content)) continue;

    const slug = pageId.replace(/^page-/, '');
    out[pageId] = {
      content: [
        headerBlock ?? { type: 'Header', props: { id: `Header-${slug}` } },
        {
          type: 'Page',
          props: {
            id: `Page-${slug}`,
            heading: title,
            content: '',
            headingSize: 'large',
            colorScheme: 'scheme-2',
            padding: { top: 80, bottom: 80 },
          },
        },
        footerBlock ?? { type: 'Footer', props: { id: `Footer-${slug}` } },
      ],
      root: { props: { meta: { title } } },
      zones: {},
    } as PageData;
    changed = true;
  }
  return changed ? out : pagesData;
}
