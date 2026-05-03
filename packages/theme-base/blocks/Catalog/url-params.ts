/**
 * Catalog URL params helper — pure parse/serialize logic.
 *
 * Catalog.astro reads `Astro.url.searchParams` via `parseCatalogUrlParams()` to
 * derive collection / page / sort / availability / colors / price filter state,
 * and serializes it back to URL via `serializeCatalogUrlParams()`.
 *
 * Defaults round-trip to empty query (so canonical URL is `/catalog` without
 * spurious params). Invalid values fall back to defaults rather than throwing.
 */

export type CatalogSort = 'newest' | 'popularity' | 'price-asc' | 'price-desc';
export type CatalogAvailability = 'all' | 'in' | 'out';

export interface CatalogUrlState {
  collection: string | undefined;
  page: number;
  sort: CatalogSort;
  availability: CatalogAvailability;
  colors: string[];
  priceMin: number | undefined;
  priceMax: number | undefined;
}

const ALLOWED_SORTS: CatalogSort[] = ['newest', 'popularity', 'price-asc', 'price-desc'];
const ALLOWED_AVAILABILITY: CatalogAvailability[] = ['all', 'in', 'out'];

function parseInt0(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export function parseCatalogUrlParams(params: URLSearchParams): CatalogUrlState {
  const sortRaw = params.get('sort') ?? 'newest';
  const sort: CatalogSort = (ALLOWED_SORTS as string[]).includes(sortRaw)
    ? (sortRaw as CatalogSort)
    : 'newest';

  const availRaw = params.get('availability') ?? 'all';
  const availability: CatalogAvailability = (ALLOWED_AVAILABILITY as string[]).includes(availRaw)
    ? (availRaw as CatalogAvailability)
    : 'all';

  const pageRaw = parseInt0(params.get('page'));
  const page = pageRaw && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  const colorsRaw = params.get('color') ?? '';
  const colors = colorsRaw
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  const collection = (params.get('collection') ?? '').trim() || undefined;

  return {
    collection,
    page,
    sort,
    availability,
    colors,
    priceMin: parseInt0(params.get('priceMin')),
    priceMax: parseInt0(params.get('priceMax')),
  };
}

export function serializeCatalogUrlParams(state: CatalogUrlState): string {
  const params = new URLSearchParams();
  if (state.collection) params.set('collection', state.collection);
  if (state.page > 1) params.set('page', String(state.page));
  if (state.sort !== 'newest') params.set('sort', state.sort);
  if (state.availability !== 'all') params.set('availability', state.availability);
  if (state.colors.length > 0) params.set('color', state.colors.join(','));
  if (state.priceMin !== undefined) params.set('priceMin', String(state.priceMin));
  if (state.priceMax !== undefined) params.set('priceMax', String(state.priceMax));
  return params.toString();
}
