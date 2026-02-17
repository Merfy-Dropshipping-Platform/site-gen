/** Monetary amount with currency */
export interface Money {
  amount: number;
  currencyCode: string;
}

/** Product image */
export interface Image {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
}

/** SEO metadata */
export interface SEO {
  title?: string;
  description?: string;
  image?: string;
}

/** Product variant (size/color combination) */
export interface Variant {
  id: string;
  title: string;
  price: number;
  compareAtPrice?: number;
  available: boolean;
  sku?: string;
  options?: Record<string, string>;
  image?: Image;
}

/** Product */
export interface Product {
  id: string;
  handle: string;
  title: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  images: Image[];
  variants: Variant[];
  tags?: string[];
  vendor?: string;
  productType?: string;
  seo?: SEO;
  createdAt?: string;
  updatedAt?: string;
}

/** Cart item */
export interface CartItem {
  variantId: string;
  title: string;
  price: number;
  quantity: number;
  image: string;
  productId?: string;
  productHandle?: string;
  variantTitle?: string;
}

/** Collection of products */
export interface Collection {
  id: string;
  handle: string;
  title: string;
  description?: string;
  image?: Image;
  productCount?: number;
  seo?: SEO;
}

/** Facet filter option */
export interface FacetOption {
  label: string;
  value: string;
  count?: number;
}

/** Facet filter group */
export interface Facet {
  key: string;
  label: string;
  options: FacetOption[];
}

/** Paginated response */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/** Store configuration */
export interface StoreConfig {
  apiBase: string;
  storeId: string;
  currency: string;
  locale: string;
}
