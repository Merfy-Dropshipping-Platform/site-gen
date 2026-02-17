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
): Promise<FetchedCollection[]> {
  try {
    const result = await firstValueFrom(
      productClient
        .send<RpcResponse<FetchedCollection[]>>("product.collections.list", {
          tenantId,
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
 * Fetch all store data (products + collections) in parallel.
 */
export async function fetchStoreData(
  productClient: ClientProxy,
  tenantId: string,
  siteId?: string,
): Promise<FetchedStoreData> {
  const [products, collections] = await Promise.all([
    fetchProducts(productClient, tenantId, siteId),
    fetchCollections(productClient, tenantId),
  ]);

  logger.log(
    `Fetched store data for tenant ${tenantId}: ${products.length} products, ${collections.length} collections`,
  );

  return { products, collections };
}
