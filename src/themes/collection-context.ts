/**
 * Контекст коллекции для подстановки плейсхолдеров {{COLLECTION_NAME}} /
 * {{COLLECTION_DESCRIPTION}} / {{COLLECTION_IMAGE}} в строковых props блоков
 * страницы page-collection (заголовок «КАТАЛОГ»/подзаголовок → имя/описание
 * коллекции). Чистый матчер: работает И на revision-коллекциях (поле `title`),
 * И на fetched-коллекциях product-сервиса (поле `name`).
 *
 * - конкретный slug → точное совпадение по slug/handle/id (как на live);
 * - пресет `preview` (нет выбранной коллекции, редактирование шаблона) →
 *   первая коллекция как реалистичный образец (вместо хардкода «Каталог»);
 * - конкретный slug без совпадения → {} (не показываем чужую коллекцию).
 */
export interface CollectionContext {
  name?: string;
  description?: string;
  image?: string;
  slug?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function toContext(c: Record<string, unknown>): CollectionContext {
  return {
    name: str(c.title) ?? str(c.name),
    description: str(c.description),
    image: str(c.image) ?? str(c.coverImageUrl),
    slug: str(c.slug) ?? str(c.handle) ?? str(c.id),
  };
}

export function resolveCollectionContext(
  collections: Array<Record<string, unknown>>,
  slug: string,
): CollectionContext {
  const cols = Array.isArray(collections)
    ? collections.filter(
        (c): c is Record<string, unknown> => !!c && typeof c === "object",
      )
    : [];
  if (cols.length === 0) return {};

  const match = cols.find((c) => {
    const keys = [c.slug, c.handle, c.id]
      .filter((v): v is string => typeof v === "string")
      .map((v) => v);
    return keys.includes(slug);
  });
  if (match) return toContext(match);

  // Пресет шаблона (нет конкретной коллекции) — показываем первую, чтобы
  // редактор видел реальный пример, а не плейсхолдер «Каталог».
  if (slug === "preview") return toContext(cols[0]);

  return {};
}
