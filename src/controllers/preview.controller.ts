import { Controller, Get, Inject, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { PreviewService } from '../services/preview.service';
import * as schema from '../db/schema';
import { PG_CONNECTION } from '../constants';

/**
 * GET /api/sites/:id/preview — renders the constructor's iframe preview for
 * the site's active revision. Phase 0 shipped as a hardcoded stub; Phase 1c
 * wires it to real site_revision data so the iframe shows the user's actual
 * page content.
 *
 * Response is HTML produced by PreviewService.renderPreviewPage (Astro
 * Container API). The page name comes from the `page` query param; the
 * controller resolves it against `data.pagesData[page].content` in the
 * current revision.
 *
 * Endpoint is PUBLIC by design — the constructor's iframe loads without
 * cookies. If a site/revision isn't found we return 404 with a tiny HTML
 * body so the iframe shows a visible error instead of NestJS's JSON.
 */
@Controller('api/sites/:id/preview')
export class PreviewController {
  constructor(
    private readonly preview: PreviewService,
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  @Get()
  async getPreview(
    @Param('id') siteId: string,
    @Query('page') page: string = 'home',
    @Res() res: Response,
  ): Promise<void> {
    const data = await this.loadRevisionData(siteId);
    if (!data) {
      res
        .status(404)
        .type('text/html')
        .send(this.errorPage(`Site ${siteId} has no active revision`));
      return;
    }

    const blocks = this.extractPageBlocks(data, page);
    if (!blocks) {
      res
        .status(404)
        .type('text/html')
        .send(this.errorPage(`Page "${page}" not found in site ${siteId}`));
      return;
    }

    const html = await this.preview.renderPreviewPage({
      blocks,
      tokensCss: this.tokensCssFromSettings(data),
      fontHead: '',
    });
    res.type('text/html').send(html);
  }

  private async loadRevisionData(
    siteId: string,
  ): Promise<Record<string, unknown> | null> {
    const [site] = await this.db
      .select({
        currentRevisionId: schema.site.currentRevisionId,
      })
      .from(schema.site)
      .where(eq(schema.site.id, siteId));
    if (!site?.currentRevisionId) return null;

    const [rev] = await this.db
      .select({ data: schema.siteRevision.data })
      .from(schema.siteRevision)
      .where(eq(schema.siteRevision.id, site.currentRevisionId));
    if (!rev?.data) return null;

    return rev.data as Record<string, unknown>;
  }

  private extractPageBlocks(
    data: Record<string, unknown>,
    page: string,
  ): Array<{ type: string; props: Record<string, unknown> }> | null {
    const pagesData = (data.pagesData ?? {}) as Record<string, unknown>;
    const pageData = pagesData[page] as Record<string, unknown> | undefined;
    if (!pageData) return null;
    const raw = pageData.content;
    let parsed: unknown;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
    } else {
      parsed = raw;
    }
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter(
        (b): b is { type: string; props: Record<string, unknown> } =>
          !!b &&
          typeof b === 'object' &&
          typeof (b as { type?: unknown }).type === 'string',
      )
      .map((b) => ({
        type: b.type,
        props: (b.props ?? {}) as Record<string, unknown>,
      }));
  }

  private tokensCssFromSettings(data: Record<string, unknown>): string {
    // TODO(078 Phase 2): derive real CSS custom properties from
    // data.themeSettings once the token pipeline lands. For now, keep the
    // Phase 0 defaults so blocks still render with sane values.
    void data;
    return ':root { --radius-button: 0px; --color-bg: 255 255 255; --color-heading: 17 17 17; --color-text: 51 51 51; --color-button-bg: 17 17 17; --color-button-text: 255 255 255; --color-button-border: 17 17 17; --font-heading: system-ui; --font-body: system-ui; --size-hero-heading: 48px; --size-hero-button-h: 48px; --container-max-width: 1320px; }';
  }

  private errorPage(message: string): string {
    const safe = message.replace(/[&<>]/g, (c) =>
      c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;',
    );
    return `<!DOCTYPE html><html><body style="font-family:system-ui;padding:24px;color:#666"><h1 style="margin:0 0 8px">Preview error</h1><p>${safe}</p></body></html>`;
  }
}
