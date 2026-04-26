import { Controller, Get, Inject, Logger, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { ClientProxy } from '@nestjs/microservices';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
type PgPool = InstanceType<typeof pg.Pool>;
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
@Controller('api/storefront-data/:id')
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
    StorefrontDataController.productPool = new pg.Pool({ connectionString: url });
    return StorefrontDataController.productPool;
  }

  @Get()
  async get(@Param('id') siteId: string, @Res() res: Response): Promise<void> {
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
      if (!products?.length && !collections?.length) {
        const pool = this.getProductPool();
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
              `SELECT id, name AS title, slug AS handle, description, image
                 FROM collections
                WHERE "shopId" = $1 AND ("deletedAt" IS NULL OR "deletedAt" IS NULL)
                ORDER BY "createdAt" DESC
                LIMIT 100`,
              [siteId],
            );
            collections = collRes.rows.map((r: Record<string, any>) => ({
              id: r.id,
              title: r.title,
              handle: r.handle ?? r.id,
              description: r.description ?? undefined,
              image: r.image ?? null,
              productIds: [],
            }));
            // Populate productIds per collection.
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
            this.logger.warn(
              `direct product DB query failed for site=${siteId}: ${(poolErr as Error)?.message ?? poolErr}`,
            );
          }
        }
      }

      res
        .header('Cache-Control', 'public, max-age=30')
        .json({ products, collections });
    } catch (err: unknown) {
      const e = err as Error;
      this.logger.warn(
        `storefront-data failed for site=${siteId}: ${e?.message ?? e}`,
      );
      res.status(200).json({ products: [], collections: [] });
    }
  }
}
