import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PreviewService } from '../services/preview.service';

/**
 * GET /api/sites/:id/preview — Phase 0 stub endpoint that renders a hardcoded
 * Hero block on a fake preview page using the PreviewService (Astro Container).
 *
 * Phase 1 will load the real `site_revision` from DB and feed its Puck JSON
 * through the same `PreviewService.renderPreviewPage` pipeline.
 */
@Controller('api/sites/:id/preview')
export class PreviewController {
  constructor(private readonly preview: PreviewService) {}

  @Get()
  async getPreview(
    @Param('id') siteId: string,
    @Query('page') page: string = '/',
    @Res() res: Response,
  ): Promise<void> {
    // Phase 0 stub: hardcoded Hero on a fake page. Phase 1 loads real revision from DB.
    const html = await this.preview.renderPreviewPage({
      blocks: [
        {
          type: 'Hero',
          props: {
            id: 'hero-pilot',
            title: `Preview of ${siteId} — ${page}`,
            subtitle: 'Astro Container pilot',
            image: { url: '', alt: '' },
            cta: { text: 'Каталог', href: '/catalog' },
            variant: 'centered',
            colorScheme: 1,
            padding: { top: 80, bottom: 80 },
          },
        },
      ],
      tokensCss:
        ':root { --radius-button: 0px; --color-bg: 255 255 255; --color-heading: 17 17 17; --color-text: 51 51 51; --color-button-bg: 17 17 17; --color-button-text: 255 255 255; --color-button-border: 17 17 17; --font-heading: system-ui; --font-body: system-ui; --size-hero-heading: 48px; --size-hero-button-h: 48px; --container-max-width: 1320px; }',
      fontHead: '',
    });
    res.type('text/html').send(html);
  }
}
