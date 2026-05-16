import { Controller, Get, Logger, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as pgModule from 'pg';
const PgPoolCtor: typeof pgModule.Pool =
  (pgModule as any).Pool ?? (pgModule as any).default?.Pool;
type PgPool = InstanceType<typeof pgModule.Pool>;

/**
 * GET /api/sites/:id/publications — published news/articles для блока
 * Publications. Read-only public endpoint, не требует auth.
 *
 * Использует отдельный pool с query_timeout=5000ms чтобы запрос на
 * отсутствующую таблицу или slow DB не блокировал инстанс.
 */
@Controller('api/sites/:id/publications')
export class PublicationsController {
  private readonly logger = new Logger(PublicationsController.name);
  private static pool: PgPool | null = null;

  private getPool(): PgPool | null {
    if (PublicationsController.pool) return PublicationsController.pool;
    const url = process.env.DATABASE_URL ?? process.env.PRODUCT_DATABASE_URL;
    if (!url) return null;
    PublicationsController.pool = new PgPoolCtor({
      connectionString: url,
      query_timeout: 5000,
      statement_timeout: 5000,
      max: 4,
    });
    return PublicationsController.pool;
  }

  @Get()
  async get(
    @Param('id') siteId: string,
    @Res() res: Response,
  ): Promise<void> {
    const pool = this.getPool();
    if (!pool) {
      res.status(200).json({ publications: [] });
      return;
    }
    try {
      const result = await pool.query(
        `SELECT id, title, slug, category, excerpt, cover_image_url AS "coverImageUrl",
                published_at AS "publishedAt"
           FROM publications
          WHERE site_id = $1 AND status = 'published'
          ORDER BY published_at DESC NULLS LAST
          LIMIT 20`,
        [siteId],
      );
      res
        .header('Cache-Control', 'public, max-age=60')
        .json({ publications: result.rows });
    } catch (err: unknown) {
      this.logger.warn(
        `publications fetch failed for site=${siteId}: ${(err as Error)?.message ?? err}`,
      );
      res.status(200).json({ publications: [] });
    }
  }
}
