import { Controller, Get, Inject, Logger, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { ClientProxy } from '@nestjs/microservices';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { PG_CONNECTION, PRODUCT_RMQ_SERVICE } from '../constants';
import {
  fetchProducts,
  fetchCollections,
} from '../generator/data-fetcher';

/**
 * GET /api/sites/:id/storefront-data — public endpoint that returns the
 * site's products and collections, used by the Catalog block's inline
 * preview script to mirror the live storefront in the constructor iframe.
 *
 * The endpoint resolves siteId → tenantId by reading the site row, then
 * calls product-service via RPC (same path as the build pipeline). No
 * tenant auth required: data is already public on the live storefront.
 */
@Controller('api/storefront-data/:id')
export class StorefrontDataController {
  private readonly logger = new Logger(StorefrontDataController.name);

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    @Inject(PRODUCT_RMQ_SERVICE)
    private readonly productClient: ClientProxy,
  ) {}

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
      // product-service uses shopId = siteId when filtering products. Try
      // tenantId first (org-level scope); if empty, retry with siteId as
      // both tenantId+siteId so single-shop merchants whose products were
      // attached at site-level still get returned.
      let [products, collections] = await Promise.all([
        fetchProducts(this.productClient, site.tenantId, siteId),
        fetchCollections(this.productClient, site.tenantId, siteId),
      ]);
      if ((!products || products.length === 0) && (!collections || collections.length === 0)) {
        const [p2, c2] = await Promise.all([
          fetchProducts(this.productClient, siteId, siteId),
          fetchCollections(this.productClient, siteId, siteId),
        ]);
        if (p2.length || c2.length) {
          products = p2;
          collections = c2;
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
