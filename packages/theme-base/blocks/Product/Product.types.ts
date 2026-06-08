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
  /** Build-pipeline name (products.json). */
  variants?: RawVariant[];
  /** Storefront-data API name (preview path). Same shape as `variants`. */
  variantCombinations?: RawVariant[];
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
  /**
   * Full variant *combinations* (each with its id + options map + price).
   * variantGroups is the flattened key→values for the chip/dropdown UI;
   * this is what the cart needs to map a selection → variantCombinationId.
   * Serialised into the live page by Product.astro (the only build-time
   * source of combination ids on an SSG page).
   */
  variants: RawVariant[];
  hasVariants: boolean;
  /** SEO meta values (or null when absent). */
  meta: { title: string | null; description: string | null };
  /** Pre-built JSON-LD payload (or null when product is unresolved). */
  jsonLd: Record<string, unknown> | null;
}

/**
 * Visual variant matrix — LAYOUT only.
 *
 * Colour decisions live in the merchant-editable colour-scheme feature
 * (`ColorSchemePanel.tsx` → `site.settings.colorSchemes` →
 * `src/themes/tokens-css.ts` → `--color-*` CSS variables). Primitives
 * consume those tokens directly; nothing about colour is configured per
 * theme here.
 *
 * Themes set these LAYOUT variants via `theme.json blockDefaults.Product`.
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
  showDescription: boolean;
}

/**
 * Default layout config — chosen so existing rose live pages render
 * unchanged when theme.json has no overrides.
 */
export const DEFAULT_VISUAL_CONFIG: ProductVisualConfig = {
  gallery: { variant: 'wrap-large', showDiscountBadge: true },
  variantsType: 'chips',
  counter: { variant: 'inline' },
  showDescription: true,
};
