/** Store configuration */
export interface StoreConfig {
  apiBase: string;
  storeId: string;
  currency: string;
  locale: string;
}

/** Product image */
export interface Image {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
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
  createdAt?: string;
  updatedAt?: string;
}

/** Product variant */
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

/** Collection of products */
export interface Collection {
  id: string;
  handle: string;
  title: string;
  description?: string;
  image?: Image;
  productCount?: number;
}
