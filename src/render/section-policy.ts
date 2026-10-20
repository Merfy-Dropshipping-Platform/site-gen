import type { Catalog, CatalogProduct, CatalogPublication } from "./catalog";
import { isPlaceholderImage, isUnsetContent } from "./empty-state";
import type { FieldState } from "./field-roles";

export type CollectionTile = {
  collectionId: string | null;
  name: string;
  image: string;
  href: string;
};

export function applySectionPolicy(
  blockName: string,
  props: Record<string, unknown>,
  catalog: Catalog,
  fields: Record<string, FieldState>,
): {
  popularProducts: CatalogProduct[] | null;
  collectionTiles: CollectionTile[] | null;
  publications: CatalogPublication[] | null;
} {
  const popular =
    blockName === "Popular" || blockName === "PopularProducts"
      ? resolvePopular(props, catalog)
      : null;
  const collectionTiles =
    blockName === "Collections" ? resolveCollections(props, catalog, fields) : null;
  const publications =
    blockName === "Publications"
      ? resolvePublications(props, catalog)
      : blockName === "BlogSection"
        ? resolveBlogPosts(props, catalog)
        : blockName === "BlogPostSection"
          ? resolveBlogPost(props, catalog)
          : null;
  return { popularProducts: popular, collectionTiles, publications };
}

/** Блог по умолчанию у каждого магазина (контракт «Публикации»). */
const DEFAULT_BLOG_HANDLE = "novosti";

const trimmed = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/** Новые сверху; запись без даты — в конце. */
function newestFirst(list: readonly CatalogPublication[]): CatalogPublication[] {
  const time = (p: CatalogPublication): number => {
    const t = p.publishedAt ? Date.parse(p.publishedAt) : NaN;
    return Number.isFinite(t) ? t : -Infinity;
  };
  return [...list].sort((a, b) => time(b) - time(a));
}

/**
 * Записи секции «Блог» (тело страницы `/blogs/{handle}`) — ВСЕ опубликованные
 * записи одного блога, новые сверху; по страницам их раскладывает сам блок.
 *
 * Блог задаёт сборка страницы (`blogHandle`/`blogId` в пропсах секции). В
 * конструкторе блога нет — показываем блог по умолчанию «Новости», а если в
 * нём пусто — блог самой свежей записи, чтобы превью не было пустым при живых
 * записях.
 */
function resolveBlogPosts(
  props: Record<string, unknown>,
  catalog: Catalog,
): CatalogPublication[] {
  const all = Array.isArray(catalog.publications) ? catalog.publications : [];
  const handle = trimmed(props.blogHandle);
  const blogId = trimmed(props.blogId);
  if (handle) return newestFirst(all.filter((p) => p.blogHandle === handle));
  if (blogId) return newestFirst(all.filter((p) => p.blogId === blogId));
  const byDefault = all.filter((p) => p.blogHandle === DEFAULT_BLOG_HANDLE);
  if (byDefault.length > 0) return newestFirst(byDefault);
  const latest = newestFirst(all)[0];
  return latest ? newestFirst(all.filter((p) => p.blogId === latest.blogId)) : [];
}

/**
 * Запись секции «Запись блога» (тело страницы `/blogs/{handle}/{slug}`).
 * Запись задаёт сборка (`publicationId`); в конструкторе — самая свежая
 * запись магазина. Записи больше нет — пусто, блок рисует заглушку.
 */
function resolveBlogPost(
  props: Record<string, unknown>,
  catalog: Catalog,
): CatalogPublication[] {
  const all = Array.isArray(catalog.publications) ? catalog.publications : [];
  const ref = trimmed(props.publicationId);
  if (!ref) return newestFirst(all).slice(0, 1);
  const exact = all.find((p) => p.id === ref || p.slug === ref);
  return exact ? [exact] : [];
}

/**
 * Прежние категории из сохранённых ревизий → адрес блога (таблица миграции
 * 0027; совпадает с Publications.puckConfig). Ревизии переводит в id блогов
 * фоновая задача (publications/revision-blog-refs.job.ts); пока она не дошла
 * до ревизии, секция фильтрует по адресу блога.
 */
const PUBLICATION_CATEGORY_BLOG_HANDLES: Record<string, string> = {
  news: "novosti",
  "новости": "novosti",
  blog: "blog",
  "блог": "blog",
  articles: "stati",
  "статьи": "stati",
};

/**
 * Ссылка на публикацию из панели: строка (id / slug / категория) либо легаси-
 * конверт pagePicker `{ href, text }` — до 2026-09-13 поле «Выбор публикации»
 * рендерилось пикером СТРАНИЦ и писало объект. Объект осмысленного выбора не
 * несёт (в нём маршрут страницы, не публикация) — трактуем как «не выбрано».
 */
function publicationRef(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return "";
}

/**
 * Публикации секции «Публикации» — тем же путём, что товары у PopularProducts
 * и плитки у Collections: единственный источник данных — каталог магазина
 * (админка). Ничего не выдумываем: нет публикаций → пустой список, и блок
 * рисует свою заглушку.
 *
 * Выбор в панели (`publicationType`):
 *   ''/'all'            → все публикации магазина;
 *   id или slug         → РОВНО эта публикация («оживить при выборе»);
 *   id блога            → записи этого блога;
 *   news|blog|articles  → записи блога novosti|blog|stati (легаси-значения пикера);
 *   выбранной больше нет → пусто (а не «первая попавшаяся»).
 */
function resolvePublications(
  props: Record<string, unknown>,
  catalog: Catalog,
): CatalogPublication[] {
  const all = Array.isArray(catalog.publications) ? catalog.publications : [];
  // Как resolvePublicationsType секции и фоновый перевод ревизий: непустой
  // publicationType главнее categoryFilter (`publicationType: ''` рядом с
  // `categoryFilter: 'Статьи'` — это «Статьи», а не «все»).
  const ref = publicationRef(
    trimmed(props.publicationType) ? props.publicationType : props.categoryFilter,
  );
  const cardsRaw =
    typeof props.cardsCount === "number"
      ? props.cardsCount
      : typeof props.cards === "number"
        ? props.cards
        : 3;
  const cards = Math.max(1, Math.min(24, Math.round(cardsRaw) || 3));

  // Выбор в панели конструктора (PUB-3): «Все записи блога» (blogId) или
  // «Одна запись» (publicationId). Старый publicationType ниже — для ревизий,
  // сохранённых до этого выбора.
  const source = trimmed(props.publicationSource);
  if (source === "publication") {
    const id = trimmed(props.publicationId);
    const exactOne = id ? all.find((p) => p.id === id || p.slug === id) : undefined;
    return exactOne ? [exactOne] : [];
  }
  if (source === "blog") {
    const blogId = trimmed(props.blogId);
    return (blogId ? all.filter((p) => p.blogId === blogId) : all).slice(0, cards);
  }

  if (!ref || ref.toLowerCase() === "all") return all.slice(0, cards);

  const exact = all.find((p) => p.id === ref || p.slug === ref);
  if (exact) return [exact];

  if (all.some((p) => p.blogId === ref)) {
    return all.filter((p) => p.blogId === ref).slice(0, cards);
  }

  const blogHandle = PUBLICATION_CATEGORY_BLOG_HANDLES[ref.toLowerCase()];
  if (blogHandle) {
    return all.filter((p) => p.blogHandle === blogHandle).slice(0, cards);
  }

  // Непонятная ссылка (удалённая публикация, мусор из старой ревизии) —
  // ПУСТО. Показать «что-нибудь» здесь значит соврать мерчанту.
  return [];
}

function resolvePopular(
  props: Record<string, unknown>,
  catalog: Catalog,
): CatalogProduct[] | null {
  const ref =
    (typeof props.collection === "string" && props.collection.trim()) ||
    (typeof props.collectionId === "string" && props.collectionId.trim()) ||
    "";
  if (!ref) return null;
  const col = catalog.collections.find(
    (c) => c.id === ref || c.slug === ref || c.name === ref,
  );
  const ids = col?.productIds?.length ? new Set(col.productIds) : null;
  const pool = ids
    ? catalog.products.filter((p) => p.id && ids.has(p.id))
    : catalog.products.filter((p) => p.collectionIds.includes(ref));
  const cardsRaw = typeof props.cards === "number" ? props.cards : 4;
  const cards = Math.max(1, Math.min(24, Math.round(cardsRaw)));
  const sliced = pool.slice(0, cards);
  return sliced.length ? sliced : null;
}

function resolveCollections(
  props: Record<string, unknown>,
  catalog: Catalog,
  _fields: Record<string, FieldState>,
): CollectionTile[] | null {
  const base =
    typeof props.cardLinkBase === "string" && props.cardLinkBase.trim()
      ? props.cardLinkBase
      : "/catalog?collection=";
  const slots = Array.isArray(props.collections)
    ? (props.collections as Array<Record<string, unknown>>)
    : [];
  const picked = slots.filter(
    (s) => typeof s.collectionId === "string" && String(s.collectionId).trim(),
  );
  const toTile = (
    collectionId: string | null,
    name: string,
    image: string,
    hrefId: string,
  ): CollectionTile => ({
    collectionId,
    name,
    image,
    href: hrefId ? `${base}${hrefId}` : "#",
  });

  if (picked.length > 0) {
    return picked.map((s) => {
      const id = String(s.collectionId).trim();
      const real =
        catalog.collections.find((c) => c.id === id || c.slug === id || c.name === id) ??
        null;
      const rawName = typeof s.heading === "string" ? s.heading : typeof s.name === "string" ? s.name : "";
      const merchantName = !isUnsetContent(rawName) ? rawName.trim() : "";
      const ownImage =
        typeof s.image === "string" && !isPlaceholderImage(s.image) ? s.image : "";
      return toTile(
        id,
        merchantName || real?.name || "Коллекция",
        ownImage || real?.image || "",
        real?.slug || id,
      );
    });
  }

  const store = catalog.collections.filter((c) => c.slug !== "general" && c.id);
  if (store.length === 0) return null;
  const colsN =
    typeof props.columns === "number" && props.columns > 0
      ? Math.max(1, Math.min(6, Math.round(props.columns)))
      : 3;
  const idStr = typeof props.id === "string" ? props.id : "";
  const secondary = /collections-2|Collections-2|collections-satin-2/i.test(idStr);
  const offset = secondary ? colsN : 0;
  return store.slice(offset, offset + colsN).map((c) =>
    toTile(c.id, c.name || "Коллекция", c.image || "", c.slug || c.id),
  );
}
