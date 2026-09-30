import { Controller, Get, Inject, Logger, Optional, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { PG_CONNECTION } from '../constants';
import { StoreContentService, resolveStoreContent } from '../content/store-content.service';
import type { StoreContent } from '../content/store-content.port';

/**
 * GET /api/sites/:id/page-meta?pageId=... — public read-only endpoint
 * returning page metadata (title, slug, url) for the Page embed block.
 *
 * Source: current site_revision → data.pages (array of {id, name, slug}).
 * Falls back gracefully (`{ page: null }`) when revision absent / page not found.
 */
@Controller('api/sites/:id/page-meta')
export class PageMetaController {
  private readonly logger = new Logger(PageMetaController.name);

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    // Второй круг (R1): содержимое ревизии — только через порт. Optional —
    // тот же приём, что в SitesDomainService/PagesService: тесты, которые
    // собирают контроллер напрямую, не обязаны его передавать.
    @Optional()
    private readonly injectedStoreContent?: StoreContentService,
  ) {}

  private storeContentInstance?: StoreContent;

  private get storeContent(): StoreContent {
    return (this.storeContentInstance ??= resolveStoreContent(
      this.injectedStoreContent,
      this.db,
    ));
  }

  @Get()
  async get(
    @Param('id') siteId: string,
    @Query('pageId') pageId: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!pageId) {
      res.status(200).json({ page: null });
      return;
    }
    try {
      const [site] = await this.db
        .select({ currentRevisionId: schema.site.currentRevisionId, publicUrl: schema.site.publicUrl })
        .from(schema.site)
        .where(eq(schema.site.id, siteId));
      if (!site?.currentRevisionId) {
        res.status(200).json({ page: null });
        return;
      }
      // Сырое содержимое (без миграций/досева) — как и раньше: этот эндпойнт
      // только достаёт id/slug/name из `data.pages`, применять шаги чтения
      // (нормализацию манифеста темы) ему незачем.
      const loaded = await this.storeContent
        .load(siteId, {
          revisionId: site.currentRevisionId,
          site: { themeId: null, publicUrl: site.publicUrl, currentRevisionId: site.currentRevisionId },
          asStored: true,
        })
        .catch(() => null);
      if (!loaded?.document) {
        res.status(200).json({ page: null });
        return;
      }
      const data = loaded.document;
      const pages = (data.pages ?? []) as Array<Record<string, unknown>>;
      const found = pages.find(
        (p) => p.id === pageId || p.slug === pageId,
      );
      if (!found) {
        res.status(200).json({ page: null });
        return;
      }
      const slug = typeof found.slug === 'string' ? found.slug : (typeof found.id === 'string' ? found.id : '');
      const path = slug === 'home' ? '/' : slug.startsWith('/') ? slug : `/${slug}`;
      res
        .header('Cache-Control', 'public, max-age=30')
        .json({
          page: {
            id: typeof found.id === 'string' ? found.id : '',
            title: typeof found.name === 'string' ? found.name : '',
            slug,
            path,
            url: site.publicUrl ? `${site.publicUrl}${path}` : path,
          },
        });
    } catch (err) {
      this.logger.warn(`page-meta failed for site=${siteId}: ${(err as Error)?.message ?? err}`);
      res.status(200).json({ page: null });
    }
  }
}
