/**
 * External field factories for Puck editor.
 *
 * These create field configs that fetch product/collection data from the
 * Store API at runtime (inside the Puck editor UI).
 */

export interface ExternalFieldConfig {
  apiBaseUrl: string;
  shopId: string;
}

export interface ExternalFieldItem {
  id: string;
  title: string;
  description?: string;
}

export interface ExternalField {
  type: 'external';
  label: string;
  fetchList: (params: { query: string }) => Promise<ExternalFieldItem[]>;
  mapRow: (item: ExternalFieldItem) => ExternalFieldItem;
  getItemSummary: (item: Record<string, unknown>) => string;
}

/**
 * Creates a Puck external field for selecting a product.
 * Fetches from GET /store/products/search?store_id=X&q=Y&limit=20
 */
export function createProductField(config: ExternalFieldConfig): ExternalField {
  return {
    type: 'external' as const,
    label: 'Product',
    fetchList: async ({ query }: { query: string }) => {
      const url = new URL(`${config.apiBaseUrl}/store/products/search`);
      url.searchParams.set('store_id', config.shopId);
      url.searchParams.set('q', query || '');
      url.searchParams.set('limit', '20');

      const res = await fetch(url.toString());
      const data = await res.json();
      return (
        data.products?.map((p: Record<string, unknown>) => ({
          id: p.id as string,
          title: p.title as string,
          description: p.handle as string,
        })) ?? []
      );
    },
    mapRow: (item: ExternalFieldItem) => item,
    getItemSummary: (item: Record<string, unknown>) =>
      (item.title as string) || (item.id as string),
  };
}

/**
 * Creates a Puck external field for selecting a collection.
 * Fetches from GET /store/collections?store_id=X, then filters client-side by query.
 */
export function createCollectionField(
  config: ExternalFieldConfig,
): ExternalField {
  return {
    type: 'external' as const,
    label: 'Collection',
    fetchList: async ({ query }: { query: string }) => {
      const url = new URL(`${config.apiBaseUrl}/store/collections`);
      url.searchParams.set('store_id', config.shopId);

      const res = await fetch(url.toString());
      const data = await res.json();
      return (
        data.collections
          ?.filter(
            (c: Record<string, unknown>) =>
              !query ||
              ((c.title as string) ?? '')
                .toLowerCase()
                .includes(query.toLowerCase()),
          )
          .map((c: Record<string, unknown>) => ({
            id: c.id as string,
            title: c.title as string,
            description: c.slug as string,
          })) ?? []
      );
    },
    mapRow: (item: ExternalFieldItem) => item,
    getItemSummary: (item: Record<string, unknown>) =>
      (item.title as string) || (item.id as string),
  };
}
