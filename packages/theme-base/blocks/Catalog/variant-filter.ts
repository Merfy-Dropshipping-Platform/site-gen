export interface CatalogVariant {
  name: string;
  value: string;
}

export interface CatalogCollection {
  id?: string;
  slug?: string;
  handle?: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
  basePrice: number;
  price?: number;
  quantity?: number;
  variants?: CatalogVariant[];
  collections?: CatalogCollection[];
  createdAt?: string;
}

export interface CatalogFilterState {
  collection: string | undefined;
  sort: 'newest' | 'popularity' | 'price-asc' | 'price-desc';
  availability: 'all' | 'in' | 'out';
  colors: string[];
  priceMin: number | undefined;
  priceMax: number | undefined;
}

const COLOR_KEYS = ['цвет', 'color'];

function priceOf(p: CatalogProduct): number {
  return Number(p.basePrice ?? p.price ?? 0);
}

function quantityOf(p: CatalogProduct): number {
  return typeof p.quantity === 'number' ? p.quantity : 1;
}

function isColorVariant(v: CatalogVariant): boolean {
  return COLOR_KEYS.includes((v.name ?? '').toLowerCase());
}

export function detectColorOptions(products: readonly CatalogProduct[]): string[] {
  const set = new Set<string>();
  for (const p of products) {
    if (!p.variants) continue;
    for (const v of p.variants) {
      if (isColorVariant(v) && v.value) set.add(v.value);
    }
  }
  return Array.from(set);
}

function matchCollection(p: CatalogProduct, scope: string): boolean {
  if (!p.collections) return false;
  return p.collections.some((c) => c.id === scope || c.slug === scope || c.handle === scope);
}

function matchColors(p: CatalogProduct, colors: readonly string[]): boolean {
  if (colors.length === 0) return true;
  if (!p.variants) return false;
  const productColors = p.variants.filter(isColorVariant).map((v) => v.value);
  return productColors.some((c) => colors.includes(c));
}

export function applyCatalogFilters(
  products: readonly CatalogProduct[],
  state: CatalogFilterState,
): CatalogProduct[] {
  let result = [...products];

  if (state.collection) {
    result = result.filter((p) => matchCollection(p, state.collection!));
  }

  if (state.availability === 'in') {
    result = result.filter((p) => quantityOf(p) > 0);
  } else if (state.availability === 'out') {
    result = result.filter((p) => quantityOf(p) <= 0);
  }

  result = result.filter((p) => matchColors(p, state.colors));

  if (state.priceMin !== undefined) {
    result = result.filter((p) => priceOf(p) >= state.priceMin!);
  }
  if (state.priceMax !== undefined) {
    result = result.filter((p) => priceOf(p) <= state.priceMax!);
  }

  switch (state.sort) {
    case 'price-asc':
      result.sort((a, b) => priceOf(a) - priceOf(b));
      break;
    case 'price-desc':
      result.sort((a, b) => priceOf(b) - priceOf(a));
      break;
    case 'newest':
      result.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
      break;
    case 'popularity':
      result.sort((a, b) => quantityOf(b) - quantityOf(a));
      break;
  }

  return result;
}
