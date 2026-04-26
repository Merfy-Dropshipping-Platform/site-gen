import { Controller, Get, Inject, Logger, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { ClientProxy } from '@nestjs/microservices';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';
import * as pgModule from 'pg';
const PgPoolCtor: typeof pgModule.Pool =
  (pgModule as any).Pool ?? (pgModule as any).default?.Pool;
type PgPool = InstanceType<typeof pgModule.Pool>;
import * as schema from '../db/schema';
import { PG_CONNECTION, PRODUCT_RMQ_SERVICE } from '../constants';
import {
  fetchProducts,
  fetchCollections,
} from '../generator/data-fetcher';

/**
 * GET /api/storefront-data/:id — public endpoint that returns the site's
 * products + collections for the constructor preview Catalog block.
 *
 * Strategy:
 *   1. Try product-service RPC (build pipeline path).
 *   2. If empty or unavailable, query product DB directly via
 *      PRODUCT_DATABASE_URL — quicker and skips RPC roundtrip when the
 *      caller is just the preview iframe (read-only public data).
 */
@Controller('api/sites/:id/storefront-data')
export class StorefrontDataController {
  private readonly logger = new Logger(StorefrontDataController.name);
  private static productPool: PgPool | null = null;

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    @Inject(PRODUCT_RMQ_SERVICE)
    private readonly productClient: ClientProxy,
  ) {}

  private getProductPool(): PgPool | null {
    if (StorefrontDataController.productPool) {
      return StorefrontDataController.productPool;
    }
    // Both sites_service and product_service share the same prod PG database
    // (different schemas/tables on one host). Use PRODUCT_DATABASE_URL when
    // explicitly provided; otherwise reuse DATABASE_URL.
    const url = process.env.PRODUCT_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) return null;
    StorefrontDataController.productPool = new PgPoolCtor({ connectionString: url });
    return StorefrontDataController.productPool;
  }

  @Get()
  async get(
    @Param('id') siteId: string,
    @Query('product') productIdParam: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const [site] = await this.db
        .select({ tenantId: schema.site.tenantId })
        .from(schema.site)
        .where(eq(schema.site.id, siteId));
      if (!site?.tenantId) {
        res.status(404).json({ products: [], collections: [] });
        return;
      }

      // Try RPC first (build-pipeline path).
      let [products, collections] = await Promise.all([
        fetchProducts(this.productClient, site.tenantId, siteId),
        fetchCollections(this.productClient, site.tenantId, siteId),
      ]);

      // Fallback: direct product DB query (RPC may be slow/empty for
      // preview workloads). Products are stored with shopId = siteId.
      let dbgError: string | null = null;
      let dbgPoolUrl: string | null = null;
      if (!products?.length && !collections?.length) {
        const pool = this.getProductPool();
        dbgPoolUrl = pool ? 'configured' : 'no PRODUCT_DATABASE_URL/DATABASE_URL';
        if (pool) {
          try {
            const prodRes = await pool.query(
              `SELECT id, title AS name, description, "basePrice", "compareAtPrice",
                      sku, weight, "weightUnit", "isPhysicalProduct",
                      "metaTitle", "metaDescription", images
                 FROM products
                WHERE "shopId" = $1 AND status = 'active' AND "deletedAt" IS NULL
                ORDER BY "createdAt" DESC
                LIMIT 100`,
              [siteId],
            );
            products = prodRes.rows.map((r: Record<string, any>) => ({
              id: r.id,
              name: r.name,
              description: r.description ?? undefined,
              price: r.basePrice != null ? Number(r.basePrice) : 0,
              basePrice: r.basePrice != null ? Number(r.basePrice) : 0,
              compareAtPrice: r.compareAtPrice != null ? Number(r.compareAtPrice) : undefined,
              sku: r.sku ?? null,
              weight: r.weight != null ? Number(r.weight) : null,
              weightUnit: r.weightUnit ?? null,
              isPhysicalProduct: r.isPhysicalProduct ?? true,
              metaTitle: r.metaTitle ?? null,
              metaDescription: r.metaDescription ?? null,
              images: Array.isArray(r.images) ? r.images : [],
            }));
            const collRes = await pool.query(
              `SELECT id, name AS title, slug AS handle, description, images
                 FROM collections
                WHERE "shopId" = $1 AND "deletedAt" IS NULL
                ORDER BY "createdAt" DESC
                LIMIT 100`,
              [siteId],
            );
            collections = collRes.rows.map((r: Record<string, any>) => {
              const img = Array.isArray(r.images) && r.images[0]
                ? (typeof r.images[0] === 'string' ? r.images[0] : r.images[0].url)
                : null;
              return {
                id: r.id,
                title: r.title,
                handle: r.handle ?? r.id,
                description: r.description ?? undefined,
                image: img,
                productIds: [] as string[],
              };
            });
            if (collections.length > 0) {
              const cpRes = await pool.query(
                `SELECT "collectionId", "productId"
                   FROM product_collections
                  WHERE "collectionId" = ANY($1::uuid[])`,
                [collections.map((c) => c.id)],
              );
              const groups: Record<string, string[]> = {};
              for (const row of cpRes.rows) {
                (groups[row.collectionId] ??= []).push(row.productId);
              }
              collections = collections.map((c) => ({
                ...c,
                productIds: groups[c.id] ?? [],
              }));
            }
          } catch (poolErr: unknown) {
            dbgError = (poolErr as Error)?.message ?? String(poolErr);
            this.logger.warn(
              `direct product DB query failed for site=${siteId}: ${dbgError}`,
            );
          }
        }
      }
      let product: Record<string, unknown> | null = null;
      if (productIdParam) {
        const found = products.find((p: any) => p.id === productIdParam || p.handle === productIdParam || p.slug === productIdParam);
        if (found) product = found as unknown as Record<string, unknown>;
      }
      if (!product && products.length > 0) {
        product = products[0] as unknown as Record<string, unknown>;
      }

      // Fetch variants for the resolved product so storefront UI can render
      // size/color pills. Uses product-service RPC `product.getVariants`
      // (works inside the docker network; direct DB on PRODUCT_DATABASE_URL
      // is firewalled when called from sites-service container).
      if (product && (product as { id?: string }).id) {
        try {
          const productRowId = (product as { id: string }).id;
          const varResp = await firstValueFrom(
            this.productClient
              .send<{ success: boolean; data?: any[] }>(
                'product.getVariants',
                { productId: productRowId, shopId: siteId },
              )
              .pipe(
                timeout(5000),
                catchError(() => of(null)),
              ),
          );
          const list: any[] = Array.isArray(varResp?.data) ? varResp!.data! : [];
          const variants = list.map((v) => {
            // RPC returns TypeORM ProductVariantCombination with `options:
            // VariantOption[]` (array of {id, value, variantGroupId,
            // variantGroup:{id,name}}). Optional `optionsList`/`options` map
            // shapes are also handled for forward-compatibility.
            const options: Record<string, string> = {};
            if (Array.isArray(v.options)) {
              for (const opt of v.options) {
                const groupName =
                  opt?.variantGroup?.name ??
                  opt?.groupName ??
                  opt?.variantGroupName;
                const value = opt?.value;
                if (groupName != null && value != null) {
                  options[String(groupName)] = String(value);
                }
              }
            } else if (v.options && typeof v.options === 'object') {
              for (const [k, val] of Object.entries(v.options)) {
                options[String(k)] = String(val);
              }
            }
            if (Object.keys(options).length === 0 && Array.isArray(v.optionsList)) {
              for (const opt of v.optionsList) {
                if (opt?.groupName != null && opt?.value != null) {
                  options[String(opt.groupName)] = String(opt.value);
                }
              }
            }
            const values = Object.values(options);
            const title =
              typeof v.title === 'string' && v.title
                ? v.title
                : values.join(' / ');
            const quantity = typeof v.quantity === 'number' ? v.quantity : 0;
            const allowBackorder = !!v.allowBackorder;
            return {
              id: String(v.id ?? ''),
              title,
              options,
              price: v.price != null ? String(v.price) : '0',
              compareAtPrice:
                v.compareAtPrice != null ? String(v.compareAtPrice) : null,
              quantity,
              allowBackorder,
              images: Array.isArray(v.images) ? v.images : [],
              sku: v.sku ?? null,
              available: quantity > 0 || allowBackorder,
            };
          });
          (product as Record<string, unknown>).variants = variants;
          (product as Record<string, unknown>).hasVariants = variants.length > 0;
        } catch (vErr) {
          this.logger.warn(
            `variant RPC failed for product=${(product as { id?: string }).id}: ${(vErr as Error)?.message ?? vErr}`,
          );
        }
      }

      // Surface debug info in response so it's visible from the browser
      // when troubleshooting empty results. Strip in production once stable.
      const debugQuery = (req: Response & { req?: { query?: { debug?: string } } }) =>
        req.req?.query?.debug === '1';
      if (debugQuery(res)) {
        res
          .header('Cache-Control', 'no-cache')
          .json({
            products,
            collections,
            product,
            _debug: {
              tenantId: site.tenantId,
              siteId,
              poolStatus: dbgPoolUrl,
              poolError: dbgError,
              hasProductDbUrl: !!process.env.PRODUCT_DATABASE_URL,
              hasDatabaseUrl: !!process.env.DATABASE_URL,
            },
          });
        return;
      }

      res
        .header('Cache-Control', 'public, max-age=30')
        .json({ products, collections, product });
    } catch (err: unknown) {
      const e = err as Error;
      this.logger.warn(
        `storefront-data failed for site=${siteId}: ${e?.message ?? e}`,
      );
      res.status(200).json({ products: [], collections: [] });
    }
  }
}
