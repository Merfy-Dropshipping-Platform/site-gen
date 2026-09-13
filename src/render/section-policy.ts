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
    blockName === "Publications" ? resolvePublications(props, catalog) : null;
  return { popularProducts: popular, collectionTiles, publications };
}

/** Синонимы категорий публикаций (совпадают с Publications.puckConfig). */
const PUBLICATION_CATEGORY_ALIASES: Record<string, string> = {
  news: "news",
  "новости": "news",
  blog: "blog",
  "блог": "blog",
  articles: "articles",
  "статьи": "articles",
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
 *   news|blog|articles  → фильтр по категории (легаси-значения пикера);
 *   выбранной больше нет → пусто (а не «первая попавшаяся»).
 */
function resolvePublications(
  props: Record<string, unknown>,
  catalog: Catalog,
): CatalogPublication[] {
  const all = Array.isArray(catalog.publications) ? catalog.publications : [];
  const ref = publicationRef(props.publicationType ?? props.categoryFilter);
  const cardsRaw =
    typeof props.cardsCount === "number"
      ? props.cardsCount
      : typeof props.cards === "number"
        ? props.cards
        : 3;
  const cards = Math.max(1, Math.min(24, Math.round(cardsRaw) || 3));

  if (!ref || ref.toLowerCase() === "all") return all.slice(0, cards);

  const exact = all.find((p) => p.id === ref || p.slug === ref);
  if (exact) return [exact];

  const category = PUBLICATION_CATEGORY_ALIASES[ref.toLowerCase()];
  if (category) {
    return all.filter((p) => p.category === category).slice(0, cards);
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
