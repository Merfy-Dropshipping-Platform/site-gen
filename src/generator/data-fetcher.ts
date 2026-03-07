/**
 * Data Fetcher — fetches products and collections from product-service via RPC.
 *
 * Used by the build pipeline to supply data for getStaticPaths at Astro build time.
 * Includes timeout and retry logic for resilience.
 */
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom, timeout, catchError, of, retry, timer } from "rxjs";
import { Logger } from "@nestjs/common";

const logger = new Logger("DataFetcher");

export interface FetchedProduct {
  id: string;
  name: string;
  description?: string;
  price: number;
  images?: string[];
  slug?: string;
  handle?: string;
}

export interface FetchedCollection {
  id: string;
  name: string;
  description?: string;
  slug?: string;
  handle?: string;
  productIds?: string[];
}

export interface FetchedStoreData {
  products: FetchedProduct[];
  collections: FetchedCollection[];
}

interface RpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

const RPC_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;

/**
 * Fetch all products for a tenant/site from the product-service via RPC.
 */
export async function fetchProducts(
  productClient: ClientProxy,
  tenantId: string,
  siteId?: string,
): Promise<FetchedProduct[]> {
  try {
    const result = await firstValueFrom(
      productClient
        .send<
          RpcResponse<FetchedProduct[]>
        >("product.list", { tenantId, siteId })
        .pipe(
          timeout(RPC_TIMEOUT_MS),
          retry({
            count: MAX_RETRIES,
            delay: () => timer(RETRY_DELAY_MS),
          }),
          catchError((err) => {
            logger.warn(
              `RPC product.list failed for tenant ${tenantId}: ${err?.message ?? err}`,
            );
            return of({
              success: false,
              data: [] as FetchedProduct[],
              message: err?.message ?? "rpc_error",
            });
          }),
        ),
    );

    if (!result?.success) {
      logger.warn(
        `product.list returned failure for tenant ${tenantId}: ${result?.message ?? "unknown"}`,
      );
      return [];
    }

    return Array.isArray(result.data) ? result.data : [];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`fetchProducts unexpected error: ${msg}`);
    return [];
  }
}

/**
 * Fetch all collections for a tenant from the product-service via RPC.
 */
export async function fetchCollections(
  productClient: ClientProxy,
  tenantId: string,
  siteId?: string,
): Promise<FetchedCollection[]> {
  try {
    const result = await firstValueFrom(
      productClient
        .send<RpcResponse<FetchedCollection[]>>("product.collections.list", {
          tenantId,
          siteId,
        })
        .pipe(
          timeout(RPC_TIMEOUT_MS),
          retry({
            count: MAX_RETRIES,
            delay: () => timer(RETRY_DELAY_MS),
          }),
          catchError((err) => {
            logger.warn(
              `RPC product.collections.list failed for tenant ${tenantId}: ${err?.message ?? err}`,
            );
            return of({
              success: false,
              data: [] as FetchedCollection[],
              message: err?.message ?? "rpc_error",
            });
          }),
        ),
    );

    if (!result?.success) {
      logger.warn(
        `product.collections.list returned failure for tenant ${tenantId}: ${result?.message ?? "unknown"}`,
      );
      return [];
    }

    return Array.isArray(result.data) ? result.data : [];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`fetchCollections unexpected error: ${msg}`);
    return [];
  }
}

/**
 * Fetch products for a single collection via RPC.
 * Returns array of product IDs belonging to the collection.
 */
export async function fetchCollectionProductIds(
  productClient: ClientProxy,
  collectionId: string,
  shopId: string,
): Promise<string[]> {
  try {
    const result = await firstValueFrom(
      productClient
        .send<RpcResponse<Array<{ id: string }>>>("collection.getProducts", {
          collectionId,
          shopId,
          take: 100,
        })
        .pipe(
          timeout(RPC_TIMEOUT_MS),
          retry({
            count: MAX_RETRIES,
            delay: () => timer(RETRY_DELAY_MS),
          }),
          catchError((err) => {
            logger.warn(
              `RPC collection.getProducts failed for collection ${collectionId}: ${err?.message ?? err}`,
            );
            return of({
              success: false,
              data: [] as Array<{ id: string }>,
              message: err?.message ?? "rpc_error",
            });
          }),
        ),
    );

    if (!result?.success || !Array.isArray(result.data)) {
      return [];
    }

    return result.data.map((p) => p.id);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`fetchCollectionProductIds unexpected error: ${msg}`);
    return [];
  }
}

/**
 * Fetch product IDs for all collections.
 * Returns a map of collectionId → productIds[].
 */
export async function fetchAllCollectionProducts(
  productClient: ClientProxy,
  collections: FetchedCollection[],
  shopId: string,
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};

  // Fetch in parallel (bounded — collections are usually few)
  const entries = await Promise.all(
    collections.map(async (c) => {
      const productIds = await fetchCollectionProductIds(
        productClient,
        c.id,
        shopId,
      );
      return [c.id, productIds] as const;
    }),
  );

  for (const [collectionId, productIds] of entries) {
    result[collectionId] = productIds;
  }

  logger.log(
    `Fetched collection-products mapping: ${Object.keys(result).length} collections`,
  );

  return result;
}

/**
 * Fetch all store data (products + collections) in parallel.
 */
export async function fetchStoreData(
  productClient: ClientProxy,
  tenantId: string,
  siteId?: string,
): Promise<FetchedStoreData> {
  const [products, collections] = await Promise.all([
    fetchProducts(productClient, tenantId, siteId),
    fetchCollections(productClient, tenantId, siteId),
  ]);

  logger.log(
    `Fetched store data for tenant ${tenantId}: ${products.length} products, ${collections.length} collections`,
  );

  return { products, collections };
}
