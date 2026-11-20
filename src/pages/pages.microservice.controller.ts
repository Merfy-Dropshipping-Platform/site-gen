/**
 * RMQ-контроллер для кастомных страниц магазина.
 *
 * Обрабатывает паттерны сообщений (зеркалит HTTP endpoints PagesController):
 * - sites.pages.create — создать страницу (опц. клон шаблона)
 * - sites.pages.delete — удалить кастомную страницу (system запрещены)
 * - sites.pages.list   — лёгкий листинг метаданных страниц (без pagesData)
 *
 * Используется api-gateway для проксирования HTTP запросов конструктора
 * к sites-service через RabbitMQ.
 */
import { Controller, Logger } from "@nestjs/common";
import { Ctx, MessagePattern, Payload, RmqContext } from "@nestjs/microservices";
import { PagesService } from "./pages.service";
import { parseWriter } from "../content/writer";

interface CreatePagePayload {
  tenantId: string;
  siteId: string;
  name: string;
  slug: string;
  templatePageId?: string;
  /** Автор записи — только от шлюза (`content/writer.ts`); нет — мерчант. */
  writer?: unknown;
}

interface DeletePagePayload {
  tenantId: string;
  siteId: string;
  pageId: string;
  writer?: unknown;
}

interface ListPagesPayload {
  tenantId: string;
  siteId: string;
}

interface UpdatePagePayload {
  tenantId: string;
  siteId: string;
  pageId: string;
  seo?: { title?: string; description?: string; keywords?: string };
  name?: string;
  /** Тело контент-страницы («Описание») → секция «Страница» дерева страницы. */
  content?: string;
  writer?: unknown;
}

@Controller()
export class PagesMicroserviceController {
  private readonly logger = new Logger(PagesMicroserviceController.name);

  constructor(private readonly pagesService: PagesService) {}

  @MessagePattern("sites.pages.create")
  async createPage(
    @Payload() data: CreatePagePayload,
    @Ctx() _ctx: RmqContext,
  ) {
    try {
      this.logger.log(`pages.create request: ${JSON.stringify(data)}`);
      const { tenantId, siteId, name, slug, templatePageId, writer } = data ?? ({} as CreatePagePayload);
      if (!tenantId || !siteId || !name || !slug) {
        return {
          success: false,
          message: "tenantId, siteId, name, slug are required",
        };
      }
      const result = await this.pagesService.createPage({
        tenantId,
        siteId,
        name,
        slug,
        ...(templatePageId ? { templatePageId } : {}),
        writer: parseWriter(writer),
      });
      return { success: true, ...result };
    } catch (e: any) {
      this.logger.error("pages.create failed", e);
      return { success: false, message: e?.message ?? "internal_error" };
    }
  }

  @MessagePattern("sites.pages.delete")
  async deletePage(
    @Payload() data: DeletePagePayload,
    @Ctx() _ctx: RmqContext,
  ) {
    try {
      this.logger.log(`pages.delete request: ${JSON.stringify(data)}`);
      const { tenantId, siteId, pageId, writer } =
        data ?? ({} as DeletePagePayload);
      if (!tenantId || !siteId || !pageId) {
        return {
          success: false,
          message: "tenantId, siteId, pageId are required",
        };
      }
      const result = await this.pagesService.deletePage({
        tenantId,
        siteId,
        pageId,
        writer: parseWriter(writer),
      });
      return { success: true, ...result };
    } catch (e: any) {
      this.logger.error("pages.delete failed", e);
      return { success: false, message: e?.message ?? "internal_error" };
    }
  }

  @MessagePattern("sites.pages.list")
  async listPages(
    @Payload() data: ListPagesPayload,
    @Ctx() _ctx: RmqContext,
  ) {
    try {
      this.logger.log(`pages.list request: ${JSON.stringify(data)}`);
      const { tenantId, siteId } = data ?? ({} as ListPagesPayload);
      if (!tenantId || !siteId) {
        return {
          success: false,
          message: "tenantId, siteId are required",
        };
      }
      const result = await this.pagesService.listPages({ tenantId, siteId });
      return { success: true, ...result };
    } catch (e: any) {
      this.logger.error("pages.list failed", e);
      return { success: false, message: e?.message ?? "internal_error" };
    }
  }

  @MessagePattern("sites.pages.update")
  async updatePage(
    @Payload() data: UpdatePagePayload,
    @Ctx() _ctx: RmqContext,
  ) {
    try {
      this.logger.log(`pages.update request: ${JSON.stringify(data)}`);
      const { tenantId, siteId, pageId, seo, name, content, writer } =
        data ?? ({} as UpdatePagePayload);
      if (!tenantId || !siteId || !pageId) {
        return {
          success: false,
          message: "tenantId, siteId, pageId are required",
        };
      }
      if (seo === undefined && name === undefined && content === undefined) {
        return { success: false, message: "nothing_to_update" };
      }
      const result = await this.pagesService.updatePage({
        tenantId,
        siteId,
        pageId,
        ...(seo !== undefined ? { seo } : {}),
        ...(name !== undefined ? { name } : {}),
        ...(content !== undefined ? { content } : {}),
        writer: parseWriter(writer),
      });
      return { success: true, ...result };
    } catch (e: any) {
      this.logger.error("pages.update failed", e);
      return { success: false, message: e?.message ?? "internal_error" };
    }
  }
}
