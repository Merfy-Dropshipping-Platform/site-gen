import { Controller, Get, Inject, Logger, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { ClientProxy } from '@nestjs/microservices';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
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
      // size/color pills. Variants live across 4 tables in product_service:
      // product_variant_combinations × variant_combination_options →
      // variant_options × variant_groups.
      if (product && (product as { id?: string }).id) {
        const productPool = this.getProductPool();
        if (productPool) {
          try {
            const productRowId = (product as { id: string }).id;
            const varRes = await productPool.query(
              `SELECT pvc.id,
                      pvc.price,
                      pvc."compareAtPrice",
                      pvc.quantity,
                      pvc."allowBackorder",
                      pvc.images,
                      pvc.sku,
                      vg.name AS group_name,
                      vo.value AS option_value
                 FROM product_variant_combinations pvc
                 LEFT JOIN variant_combination_options vco ON vco."combinationId" = pvc.id
                 LEFT JOIN variant_options vo ON vo.id = vco."optionId"
                 LEFT JOIN variant_groups vg ON vg.id = vo."variantGroupId"
                WHERE pvc."productId" = $1
                ORDER BY pvc.id, vg.position NULLS LAST, vo.position NULLS LAST`,
              [productRowId],
            );
            // Group rows by combination id (one row per option within a combination)
            const byId = new Map<string, {
              id: string;
              price: string;
              compareAtPrice: string | null;
              quantity: number;
              allowBackorder: boolean;
              images: string[];
              sku: string | null;
              options: Record<string, string>;
            }>();
            for (const row of varRes.rows as Array<Record<string, any>>) {
              const cid = String(row.id);
              let combo = byId.get(cid);
              if (!combo) {
                combo = {
                  id: cid,
                  price: row.price != null ? String(row.price) : '0',
                  compareAtPrice: row.compareAtPrice != null ? String(row.compareAtPrice) : null,
                  quantity: row.quantity != null ? Number(row.quantity) : 0,
                  allowBackorder: !!row.allowBackorder,
                  images: Array.isArray(row.images) ? row.images : [],
                  sku: row.sku ?? null,
                  options: {},
                };
                byId.set(cid, combo);
              }
              if (row.group_name && row.option_value != null) {
                combo.options[String(row.group_name)] = String(row.option_value);
              }
            }
            const variants = Array.from(byId.values()).map((c) => {
              const values = Object.values(c.options);
              const title = values.length > 0 ? values.join(' / ') : '';
              const available = c.quantity > 0 || c.allowBackorder;
              return {
                id: c.id,
                title,
                options: c.options,
                price: c.price,
                compareAtPrice: c.compareAtPrice,
                quantity: c.quantity,
                allowBackorder: c.allowBackorder,
                images: c.images,
                sku: c.sku,
                available,
              };
            });
            (product as Record<string, unknown>).variants = variants;
            (product as Record<string, unknown>).hasVariants = variants.length > 0;
          } catch (vErr) {
            this.logger.warn(
              `variant fetch failed for product=${(product as { id?: string }).id}: ${(vErr as Error)?.message ?? vErr}`,
            );
          }
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
