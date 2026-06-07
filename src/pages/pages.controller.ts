import {
  Controller,
  Post,
  Delete,
  Param,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { PagesService } from "./pages.service";

/**
 * Pages CRUD endpoints — custom user pages внутри revision.data.
 *
 * POST   /api/sites/:id/pages           — создать страницу (опционально клон шаблона)
 * DELETE /api/sites/:id/pages/:pageId   — удалить кастомную страницу (system запрещены)
 *
 * tenantId передаётся в body (как и в остальных контроллерах сервиса —
 * аутентификация/изоляция выполняется на стороне api-gateway).
 */
@Controller("api/sites/:id/pages")
export class PagesController {
  private readonly logger = new Logger(PagesController.name);

  constructor(private readonly pagesService: PagesService) {}

  @Post()
  async createPage(
    @Param("id") siteId: string,
    @Body()
    body: {
      tenantId: string;
      name: string;
      slug: string;
      templatePageId?: string;
    },
  ) {
    if (!body?.tenantId || !body?.name || !body?.slug) {
      throw new HttpException(
        "tenantId, name, slug required",
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.pagesService.createPage({
      tenantId: body.tenantId,
      siteId,
      name: body.name,
      slug: body.slug,
      templatePageId: body.templatePageId,
    });
  }

  @Delete(":pageId")
  async deletePage(
    @Param("id") siteId: string,
    @Param("pageId") pageId: string,
    @Body() body: { tenantId: string },
  ) {
    if (!body?.tenantId) {
      throw new HttpException("tenantId required", HttpStatus.BAD_REQUEST);
    }
    return this.pagesService.deletePage({
      tenantId: body.tenantId,
      siteId,
      pageId,
    });
  }
}
