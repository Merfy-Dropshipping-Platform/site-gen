export type CatalogCollection = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  images: string[];
  productIds: string[];
};

export type CatalogProduct = {
  id: string;
  name: string;
  slug: string;
  image: string;
  images: string[];
  price: number | null;
  compareAtPrice: number | null;
  collectionIds: string[];
};

export type CatalogPublication = {
  id: string;
  title: string;
  slug: string;
  /** news | blog | articles — категория из админки (publications.category). */
  category: string;
  excerpt: string;
  coverImageUrl: string | null;
  publishedAt: string | null;
};

export type Catalog = {
  collections: CatalogCollection[];
  products: CatalogProduct[];
  publications: CatalogPublication[];
};

export const EMPTY_CATALOG: Catalog = {
  collections: [],
  products: [],
  publications: [],
};

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
}

function firstImage(p: Record<string, unknown>): string {
  const images = Array.isArray(p.images) ? p.images : [];
  const raw = images[0];
  if (typeof raw === "string" && raw) return raw;
  if (raw && typeof raw === "object" && typeof (raw as { url?: string }).url === "string") {
    return (raw as { url: string }).url;
  }
  return str(p.image);
}

export function normalizeCatalog(raw: {
  products?: unknown;
  collections?: unknown;
  publications?: unknown;
}): Catalog {
  const productsIn = Array.isArray(raw.products) ? raw.products : [];
  const colsIn = Array.isArray(raw.collections) ? raw.collections : [];
  const pubsIn = Array.isArray(raw.publications) ? raw.publications : [];

  const products: CatalogProduct[] = productsIn.map((item) => {
    const p = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const images = Array.isArray(p.images)
      ? p.images.map((x) => (typeof x === "string" ? x : "")).filter(Boolean)
      : [];
    const img = firstImage(p);
    const membership = Array.isArray(p.collections) ? p.collections : [];
    const fromPc = Array.isArray(p.productCollections) ? p.productCollections : [];
    const collectionIds = [
      ...membership.map((c) => {
        const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
        return str(o.id || o.collectionId || o.slug);
      }),
      ...fromPc.map((c) => {
        const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
        return str(o.collectionId || o.id);
      }),
    ].filter(Boolean);
    return {
      id: str(p.id),
      name: str(p.name || p.title) || "Товар",
      slug: str(p.slug || p.handle || p.id),
      image: img,
      images: images.length ? images : img ? [img] : [],
      price: num(p.price ?? p.basePrice),
      compareAtPrice: num(p.compareAtPrice ?? p.oldPrice),
      collectionIds,
    };
  });

  const collections: CatalogCollection[] = colsIn.map((item) => {
    const c = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const images = Array.isArray(c.images)
      ? c.images.map((x) => (typeof x === "string" ? x : "")).filter(Boolean)
      : [];
    const own =
      (typeof c.image === "string" && c.image) ||
      images[0] ||
      null;
    const slug = str(c.slug || c.handle || c.id);
    const explicitIds = Array.isArray(c.productIds) ? c.productIds.map(str).filter(Boolean) : [];
    const fromProducts = products
      .filter((p) => p.collectionIds.includes(str(c.id)) || p.collectionIds.includes(slug))
      .map((p) => p.id);
    return {
      id: str(c.id),
      name: str(c.name || c.title) || "Коллекция",
      slug,
      image: own,
      images,
      productIds: explicitIds.length ? explicitIds : fromProducts,
    };
  });

  const publications: CatalogPublication[] = pubsIn.map((item) => {
    const x = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    // Обложка приходит из разных источников под разными именами: админка и
    // storefront-эндпойнт дают coverImageUrl, build-time publications.json —
    // ещё и image/href. Берём первое непустое, иначе карточка «теряла» фото.
    const cover =
      (typeof x.coverImageUrl === "string" && x.coverImageUrl) ||
      (typeof x.image === "string" && x.image) ||
      null;
    return {
      id: str(x.id),
      title: str(x.title),
      slug: str(x.slug),
      category: str(x.category),
      excerpt: str(x.excerpt),
      coverImageUrl: cover,
      publishedAt:
        typeof x.publishedAt === "string"
          ? x.publishedAt
          : x.publishedAt instanceof Date
            ? x.publishedAt.toISOString()
            : null,
    };
  });

  return { collections, products, publications };
}
