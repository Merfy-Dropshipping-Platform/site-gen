/**
 * Product — headless types.
 *
 * The "view" types are the contract every Product primitive (parts/*.astro)
 * consumes. Raw API shape (`RawProduct`) is normalised exactly once in
 * Product.headless.ts → ProductView, then primitives never see raw fields.
 *
 * Theme-specific visual variants live in `ProductVisualConfig` and are
 * driven by `theme.json blockDefaults.Product.*`. They affect rendering
 * only — they do NOT change the data shape.
 */

export interface RawImage {
  url?: string;
  alt?: string;
}

export interface RawVariant {
  id: string;
  title: string;
  price?: string | number;
  available?: boolean;
  options?: Record<string, string>;
}

export interface RawProduct {
  id?: string;
  slug?: string;
  handle?: string;
  name?: string;
  title?: string;
  description?: string;
  price?: string | number;
  basePrice?: string | number;
  oldPrice?: string | number;
  compareAtPrice?: string | number;
  image?: string;
  images?: Array<string | RawImage>;
  variants?: RawVariant[];
  hasVariants?: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  sku?: string;
}

export interface PriceView {
  /** Formatted with currency, e.g. "5 990 ₽". Empty string when zero/missing. */
  formatted: string;
  /** Raw amount in major units (rubles), 0 when missing. */
  amount: number;
}

export interface VariantOptionView {
  value: string;
  available: boolean;
}

export interface VariantGroupView {
  /** Option key as authored in the product (e.g. "Цвет", "Размер"). */
  key: string;
  options: VariantOptionView[];
}

export interface GalleryImageView {
  src: string;
  alt: string;
}

export interface GalleryView {
  hero: GalleryImageView | null;
  thumbs: GalleryImageView[];
}

export interface ProductView {
  /** Stable identifier for cart/analytics events. */
  id: string;
  slug: string;
  handle: string;
  name: string;
  brand: string | null;
  description: string;
  price: PriceView;
  oldPrice: PriceView;
  hasDiscount: boolean;
  gallery: GalleryView;
  variantGroups: VariantGroupView[];
  hasVariants: boolean;
  /** SEO meta values (or null when absent). */
  meta: { title: string | null; description: string | null };
  /** Pre-built JSON-LD payload (or null when product is unresolved). */
  jsonLd: Record<string, unknown> | null;
}

/**
 * Visual variant matrix — every primitive picks the variant it cares about.
 * Themes set these via theme.json blockDefaults.Product. Defaults preserve
 * pre-headless behaviour so existing themes keep rendering untouched.
 */
export interface ProductVisualConfig {
  gallery: {
    /** wrap-large = rose (2 thumbs 318×318 wrapping); inline-small = flux (2 thumbs 124×124 row). */
    variant: 'wrap-large' | 'inline-small';
    showDiscountBadge: boolean;
  };
  variantsType: 'chips' | 'dropdown';
  counter: {
    variant: 'inline' | 'pill';
  };
  actions: {
    /** mono = both buttons inherit fg/bg; accent = primary button uses accent token. */
    scheme: 'mono' | 'accent';
  };
  showDescription: boolean;
}

/**
 * Default visual config — chosen so existing rose live pages render
 * unchanged when theme.json has no overrides.
 */
export const DEFAULT_VISUAL_CONFIG: ProductVisualConfig = {
  gallery: { variant: 'wrap-large', showDiscountBadge: true },
  variantsType: 'chips',
  counter: { variant: 'inline' },
  actions: { scheme: 'mono' },
  showDescription: true,
};
