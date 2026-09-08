import type { Catalog, CatalogProduct } from "./catalog";
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
): { popularProducts: CatalogProduct[] | null; collectionTiles: CollectionTile[] | null } {
  const popular =
    blockName === "Popular" || blockName === "PopularProducts"
      ? resolvePopular(props, catalog)
      : null;
  const collectionTiles =
    blockName === "Collections" ? resolveCollections(props, catalog, fields) : null;
  return { popularProducts: popular, collectionTiles };
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
