/**
 * HTTP endpoints for theme presets.
 *
 * - GET  /api/theme-presets              — list active presets (summary)
 * - GET  /api/theme-presets/:id          — full preset (content + tokens)
 * - POST /api/sites/:siteId/theme/apply  — apply preset to a site
 */
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { ThemePresetService } from './theme-preset.service';

interface ApplyThemeBody {
  presetId: string;
  replaceContent?: boolean;
  actorId?: string;
}

@Controller()
export class ThemePresetController {
  constructor(private readonly presets: ThemePresetService) {}

  @Get('api/theme-presets')
  async list() {
    return this.presets.list();
  }

  @Get('api/theme-presets/:id')
  async get(@Param('id') id: string) {
    return this.presets.get(id);
  }

  @Post('api/sites/:siteId/theme/apply')
  async apply(@Param('siteId') siteId: string, @Body() body: ApplyThemeBody) {
    return this.presets.applyToSite(siteId, body.presetId, {
      replaceContent: body.replaceContent,
      actorId: body.actorId,
    });
  }
}
