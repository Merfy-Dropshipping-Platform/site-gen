import type { ClientProxy } from "@nestjs/microservices";
import { fetchCollections, fetchProducts, type FetchedStoreData } from "../generator/data-fetcher";
import { EMPTY_CATALOG, normalizeCatalog, type Catalog } from "./catalog";

export type RenderContext = {
  siteId: string;
  themeId: string;
  catalog: Catalog;
  themeSettings: unknown;
};

const TTL_MS = 30_000;
const g = globalThis as unknown as {
  __merfyRenderCatalog?: Map<string, { t: number; p: Promise<Catalog> }>;
};

export function catalogFromStoreData(store: FetchedStoreData, publications: unknown[] = []): Catalog {
  return normalizeCatalog({
    products: store.products,
    collections: store.collections,
    publications,
  });
}

async function loadCatalog(
  productClient: ClientProxy,
  tenantId: string,
  siteId: string,
): Promise<Catalog> {
  const map = (g.__merfyRenderCatalog ??= new Map());
  const hit = map.get(siteId);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.p;
  const p = (async () => {
    try {
      const [products, collections] = await Promise.all([
        fetchProducts(productClient, tenantId, siteId),
        fetchCollections(productClient, tenantId, siteId),
      ]);
      return normalizeCatalog({ products, collections, publications: [] });
    } catch {
      return EMPTY_CATALOG;
    }
  })();
  map.set(siteId, { t: Date.now(), p });
  return p;
}

export async function createRenderContext(input: {
  siteId: string;
  themeId: string | null;
  tenantId: string | null;
  themeSettings: unknown;
  productClient: ClientProxy;
}): Promise<RenderContext | { error: "NO_THEME" }> {
  if (!input.themeId) return { error: "NO_THEME" };
  const catalog =
    input.tenantId
      ? await loadCatalog(input.productClient, input.tenantId, input.siteId)
      : EMPTY_CATALOG;
  return {
    siteId: input.siteId,
    themeId: input.themeId,
    catalog,
    themeSettings: input.themeSettings ?? {},
  };
}
