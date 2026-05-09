/**
 * Product — headless logic.
 *
 * Pure TS, no Astro. Single responsibility: turn a `RawProduct` (build-time
 * snapshot from product service) plus authored block props into a
 * `ProductView` consumed by Product.astro and every primitive in `parts/`.
 *
 * Bug fixes for price formatting / variant grouping / SEO go here ONCE and
 * apply across every theme.
 */

import type {
  GalleryImageView,
  GalleryView,
  PriceView,
  ProductView,
  RawImage,
  RawProduct,
  RawVariant,
  VariantGroupView,
} from './Product.types';

// — Currency —

export function parsePrice(v: number | string | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const cleaned = String(v).replace(/[^\d.,-]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function formatRub(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const grouped = String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped} ₽`;
}

function toPriceView(raw: number | string | null | undefined): PriceView {
  const amount = parsePrice(raw);
  return { amount, formatted: formatRub(amount) };
}

// — Images —

function imageEntryToUrl(entry: string | RawImage): string {
  if (typeof entry === 'string') return entry;
  return entry?.url ?? '';
}

function normaliseGallery(p: RawProduct, productName: string): GalleryView {
  const arr = Array.isArray(p.images) ? p.images : [];
  const urls = arr.map(imageEntryToUrl).filter((s): s is string => !!s);
  const heroUrl = urls[0] ?? p.image ?? '';
  if (!heroUrl) return { hero: null, thumbs: [] };

  const hero: GalleryImageView = { src: heroUrl, alt: productName };
  const thumbs: GalleryImageView[] = urls.slice(1, 4).map((src, idx) => ({
    src,
    alt: `${productName} — фото ${idx + 2}`,
  }));
  return { hero, thumbs };
}

// — Variants —

function buildVariantGroups(variants: RawVariant[]): VariantGroupView[] {
  // Each option-key collects unique values; "available" is true when at
  // least one variant carrying that value is in stock.
  const groupMap = new Map<string, Map<string, boolean>>();
  for (const v of variants) {
    if (!v.options) continue;
    for (const [key, value] of Object.entries(v.options)) {
      if (!groupMap.has(key)) groupMap.set(key, new Map());
      const valMap = groupMap.get(key)!;
      const avail = v.available !== false;
      const prev = valMap.get(value) ?? false;
      valMap.set(value, prev || avail);
    }
  }
  return Array.from(groupMap.entries()).map(([key, valMap]) => ({
    key,
    options: Array.from(valMap.entries()).map(([value, available]) => ({ value, available })),
  }));
}

// — JSON-LD —

function buildJsonLd(p: RawProduct, view: Pick<ProductView, 'name' | 'description' | 'price' | 'gallery'>): Record<string, unknown> | null {
  const offer =
    view.price.amount > 0
      ? {
          '@type': 'Offer',
          price: Math.round(view.price.amount),
          priceCurrency: 'RUB',
          availability: 'https://schema.org/InStock',
        }
      : undefined;
  const images = [view.gallery.hero, ...view.gallery.thumbs]
    .filter((i): i is GalleryImageView => !!i)
    .map((i) => i.src);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: view.name,
    description: view.description || undefined,
    image: images.length ? images : undefined,
    sku: p.sku ?? undefined,
    offers: offer,
  };
}

// — Resolution —

export function resolveProduct(idOrSlug: string | undefined, source: RawProduct[]): RawProduct | null {
  if (!idOrSlug || source.length === 0) return null;
  return (
    source.find((p) => p.slug === idOrSlug || p.handle === idOrSlug || p.id === idOrSlug) ?? null
  );
}

// — Top-level normaliser —

export function normaliseProduct(
  raw: RawProduct,
  fallbackDescription = '',
): ProductView {
  const name = raw.name ?? raw.title ?? '';
  const description = raw.description ?? fallbackDescription ?? '';
  const price = toPriceView(raw.price ?? raw.basePrice ?? 0);
  const oldPrice = toPriceView(raw.compareAtPrice ?? raw.oldPrice ?? 0);
  const hasDiscount = oldPrice.amount > 0 && oldPrice.amount > price.amount;
  const gallery = normaliseGallery(raw, name);
  const productVariants = Array.isArray(raw.variants) ? raw.variants : [];
  const hasVariants = !!raw.hasVariants && productVariants.length > 0;
  const variantGroups = hasVariants ? buildVariantGroups(productVariants) : [];

  const view: ProductView = {
    id: raw.id ?? raw.slug ?? raw.handle ?? '',
    slug: raw.slug ?? raw.handle ?? raw.id ?? '',
    handle: raw.handle ?? raw.slug ?? raw.id ?? '',
    name,
    brand: null,
    description,
    price,
    oldPrice,
    hasDiscount,
    gallery,
    variantGroups,
    hasVariants,
    meta: {
      title: raw.metaTitle ?? null,
      description: raw.metaDescription ?? null,
    },
    jsonLd: null,
  };

  view.jsonLd = buildJsonLd(raw, view);
  return view;
}

/**
 * Empty/skeleton view for the standalone fallback path (no productId,
 * no products.json). Primitives can render placeholders without needing
 * to handle a `null` ProductView.
 */
export function emptyProductView(fallbackDescription = ''): ProductView {
  return {
    id: '',
    slug: '',
    handle: '',
    name: '',
    brand: null,
    description: fallbackDescription,
    price: { amount: 0, formatted: '' },
    oldPrice: { amount: 0, formatted: '' },
    hasDiscount: false,
    gallery: { hero: null, thumbs: [] },
    variantGroups: [],
    hasVariants: false,
    meta: { title: null, description: null },
    jsonLd: null,
  };
}
