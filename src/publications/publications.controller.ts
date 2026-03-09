import { Controller, Logger } from "@nestjs/common";
import { MessagePattern, Payload, Ctx, RmqContext } from "@nestjs/microservices";
import { PublicationsService } from "./publications.service";

@Controller()
export class PublicationsMicroserviceController {
  private readonly logger = new Logger(PublicationsMicroserviceController.name);

  constructor(private readonly service: PublicationsService) {}

  @MessagePattern("publications.list")
  async listPublished(@Payload() data: any, @Ctx() _ctx: RmqContext) {
    try {
      const { tenantId, siteId } = data ?? {};
      if (!tenantId || !siteId) {
        return { success: false, message: "tenantId and siteId required" };
      }
      const publications = await this.service.findPublished(siteId, tenantId);
      return { success: true, data: publications };
    } catch (e: any) {
      this.logger.error("publications.list failed", e);
      return { success: false, message: e?.message ?? "internal_error" };
    }
  }

  @MessagePattern("publications.listAll")
  async listAll(@Payload() data: any, @Ctx() _ctx: RmqContext) {
    try {
      const { tenantId, siteId, status, category, page, limit, sort } =
        data ?? {};
      if (!tenantId || !siteId) {
        return { success: false, message: "tenantId and siteId required" };
      }
      const result = await this.service.findAll({
        organizationId: tenantId,
        siteId,
        status,
        category,
        page,
        limit,
        sort,
      });
      return { success: true, data: result.data, total: result.total };
    } catch (e: any) {
      this.logger.error("publications.listAll failed", e);
      return { success: false, message: e?.message ?? "internal_error" };
    }
  }

  @MessagePattern("publications.getBySlug")
  async getBySlug(@Payload() data: any, @Ctx() _ctx: RmqContext) {
    try {
      const { tenantId, siteId, slug } = data ?? {};
      if (!tenantId || !siteId || !slug) {
        return { success: false, message: "tenantId, siteId, and slug required" };
      }
      const publication = await this.service.findBySlug(slug, siteId, tenantId);
      if (!publication) {
        return { success: false, message: "not_found" };
      }
      return { success: true, data: publication };
    } catch (e: any) {
      this.logger.error("publications.getBySlug failed", e);
      return { success: false, message: e?.message ?? "internal_error" };
    }
  }

  @MessagePattern("publications.getById")
  async getById(@Payload() data: any, @Ctx() _ctx: RmqContext) {
    try {
      const { tenantId, id } = data ?? {};
      if (!tenantId || !id) {
        return { success: false, message: "tenantId and id required" };
      }
      const publication = await this.service.findOne(id, tenantId);
      if (!publication) {
        return { success: false, message: "not_found" };
      }
      return { success: true, data: publication };
    } catch (e: any) {
      this.logger.error("publications.getById failed", e);
      return { success: false, message: e?.message ?? "internal_error" };
    }
  }

  @MessagePattern("publications.create")
  async create(@Payload() data: any, @Ctx() _ctx: RmqContext) {
    try {
      const { tenantId, shopId, title, category, content, excerpt, coverImageUrl, status, scheduledAt } =
        data ?? {};
      if (!tenantId || !shopId || !title || !category) {
        return { success: false, message: "tenantId, shopId, title, and category required" };
      }
      const result = await this.service.create({
        organizationId: tenantId,
        siteId: shopId,
        title,
        category,
        content: content || "",
        excerpt,
        coverImageUrl,
        status,
        scheduledAt,
      });
      return { success: true, data: result };
    } catch (e: any) {
      this.logger.error("publications.create failed", e);
      return { success: false, message: e?.message ?? "internal_error" };
    }
  }

  @MessagePattern("publications.update")
  async update(@Payload() data: any, @Ctx() _ctx: RmqContext) {
    try {
      const { tenantId, id, ...updateData } = data ?? {};
      if (!tenantId || !id) {
        return { success: false, message: "tenantId and id required" };
      }
      const result = await this.service.update(id, tenantId, updateData);
      if (!result) {
        return { success: false, message: "not_found" };
      }
      return { success: true, data: result };
    } catch (e: any) {
      this.logger.error("publications.update failed", e);
      return { success: false, message: e?.message ?? "internal_error" };
    }
  }

  @MessagePattern("publications.delete")
  async delete(@Payload() data: any, @Ctx() _ctx: RmqContext) {
    try {
      const { tenantId, id, shopId } = data ?? {};
      if (!tenantId || !id || !shopId) {
        return { success: false, message: "tenantId, id, and shopId required" };
      }
      const deleted = await this.service.delete(id, tenantId, shopId);
      if (!deleted) {
        return { success: false, message: "not_found" };
      }
      return { success: true };
    } catch (e: any) {
      this.logger.error("publications.delete failed", e);
      return { success: false, message: e?.message ?? "internal_error" };
    }
  }
}
