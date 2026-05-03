export interface CatalogScopeSources {
  explicitCollectionSlug: string | undefined;
  routeSlug: string | undefined;
  urlQueryCollection: string | undefined;
}

const RESERVED_SLUGS = new Set(['_placeholder']);

function normalize(v: string | undefined): string | undefined {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  if (!trimmed || RESERVED_SLUGS.has(trimmed)) return undefined;
  return trimmed;
}

export function resolveCatalogScope(sources: CatalogScopeSources): string | undefined {
  return normalize(sources.explicitCollectionSlug)
    ?? normalize(sources.routeSlug)
    ?? normalize(sources.urlQueryCollection);
}
