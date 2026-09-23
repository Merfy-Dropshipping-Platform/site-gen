/**
 * B17 — контент-страницы («О нас», «Доставка», «Контакты») досеиваются
 * СЕРВЕРОМ из пакета темы.
 *
 * Раньше их выдумывал конструктор (`seedContentPages` в pupaMigrate.ts):
 * пустой блок «Страница» с `heading: ''` и `content: ''`. Первое же сохранение
 * вмораживало эту пустышку в ревизию, и витрина, которая берёт контент из
 * пакета темы (`extractPageBlocks` → `PageResolver.resolvePage`), переставала
 * его брать — ветка lazy-seed работает только когда страницы нет в `pagesData`.
 * Наблюдалось как пустая секция «Страница» на /delivery: в пакете темы там
 * 214 символов текста, у мерчанта — 0.
 *
 * Теперь источник один: пакет темы. Сервер подставляет его содержимое на
 * ЧТЕНИИ (конструктор видит ровно то же, что витрина), а
 * `revision-write-filter` не даёт записать этот сид обратно в ревизию.
 */
import { getPageResolver } from './page-resolver-instance';
import { unifyFooterWithHome, unifyHeaderWithHome } from '../utils/revision-migrations';

/** Совпадает с `CONTENT_PAGE_TITLES` в revision-migrations и с клиентским списком. */
export const CONTENT_PAGE_IDS = ['page-about', 'page-delivery', 'page-contacts'] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export async function seedContentPagesFromTheme(
  data: Record<string, unknown>,
  themeId: string | null | undefined,
  /** Пункт 3б: подвал досеянной страницы = подвал главной (выключатель PARITY_FOOTER). */
  options: { unifyFooter?: boolean } = {},
): Promise<Record<string, unknown>> {
  if (!themeId || !isPlainObject(data)) return data;
  const pagesData = isPlainObject(data.pagesData) ? { ...data.pagesData } : {};
  const missing = CONTENT_PAGE_IDS.filter((id) => pagesData[id] === undefined);
  if (missing.length === 0) return data;

  let resolver: ReturnType<typeof getPageResolver>;
  try {
    resolver = getPageResolver(themeId);
  } catch {
    return data;
  }
  // Список страниц берём из МАНИФЕСТА темы, а не из ревизии: `normalizeRevision`
  // домёрдживает страницы манифеста только при подъёме версии 1.0 → 2.0, а у
  // живых ревизий `manifestVersion` уже '2.0' — там `pages[]` остаётся таким,
  // каким его записал конструктор, и `resolvePage` падал бы «Page not found».
  const manifestRevision = resolver.normalizeRevision({ pages: [], pagesData: {} });

  let changed = false;
  for (const pageId of missing) {
    try {
      const resolved = await resolver.resolvePage(manifestRevision, pageId);
      const raw = resolved.content as unknown;
      const blocks = Array.isArray(raw)
        ? raw
        : isPlainObject(raw) && Array.isArray((raw as { content?: unknown }).content)
          ? ((raw as { content: unknown[] }).content as unknown[])
          : null;
      if (!blocks) continue;
      // Шапка страницы — всегда шапка главной (тот же канон, что на чтении
      // ревизии). Ключ `__seed` временный: unifyHeaderWithHome работает над
      // картой страниц и берёт `home` оттуда же.
      const withHomeHeader = unifyHeaderWithHome({
        home: pagesData['home'],
        __seed: { content: blocks },
      });
      const unified = (
        options.unifyFooter ? unifyFooterWithHome(withHomeHeader) : withHomeHeader
      ) as Record<string, { content?: unknown[] } | undefined>;
      pagesData[pageId] = {
        content: unified.__seed?.content ?? blocks,
        root: isPlainObject(raw) ? ((raw as { root?: unknown }).root ?? { props: {} }) : { props: {} },
        zones: isPlainObject(raw) ? ((raw as { zones?: unknown }).zones ?? {}) : {},
      };
      changed = true;
    } catch {
      // Страницы нет ни в ревизии, ни в пакете темы — оставляем как есть.
    }
  }
  return changed ? { ...data, pagesData } : data;
}
