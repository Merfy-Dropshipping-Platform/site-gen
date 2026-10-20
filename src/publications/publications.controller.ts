import { Controller, Logger } from "@nestjs/common";
import {
  MessagePattern,
  Payload,
  Ctx,
  RmqContext,
} from "@nestjs/microservices";
import { PublicationsService } from "./publications.service";
import { BlogsService } from "./blogs.service";
import {
  PublicationError,
  missingParams,
  publicationNotFound,
  toRpcFailure,
} from "./publications.errors";

/**
 * RPC публикаций и блогов. Ошибка — `{ success: false, message, error: { code,
 * message, field?, status } }` (контракт «Публикации», PUB-11); шлюз
 * превращает её в HTTP-ответ с этим статусом.
 */
@Controller()
export class PublicationsMicroserviceController {
  private readonly logger = new Logger(PublicationsMicroserviceController.name);

  constructor(
    private readonly service: PublicationsService,
    private readonly blogs: BlogsService,
  ) {}

  private async run<T>(pattern: string, work: () => Promise<T>) {
    try {
      return await work();
    } catch (e: unknown) {
      if (!(e instanceof PublicationError)) {
        this.logger.error(`${pattern} failed`, e as Error);
      }
      return toRpcFailure(e);
    }
  }

  @MessagePattern("publications.list")
  async listPublished(@Payload() data: any, @Ctx() _ctx: RmqContext) {
    return this.run("publications.list", async () => {
      const { tenantId, siteId } = data ?? {};
      if (!tenantId || !siteId) throw missingParams("tenantId, siteId");
      const publications = await this.service.findPublished(siteId, tenantId);
      return { success: true, data: publications };
    });
  }

  @MessagePattern("publications.listAll")
  async listAll(@Payload() data: any, @Ctx() _ctx: RmqContext) {
    return this.run("publications.listAll", async () => {
      const { tenantId, siteId, status, blogId, category, page, limit, sort } =
        data ?? {};
      if (!tenantId || !siteId) throw missingParams("tenantId, siteId");
      const result = await this.service.findAll({
        organizationId: tenantId,
        siteId,
        status,
        blogId,
        category,
        page,
        limit,
        sort,
      });
      return { success: true, data: result.data, total: result.total };
    });
  }

  @MessagePattern("publications.getBySlug")
  async getBySlug(@Payload() data: any, @Ctx() _ctx: RmqContext) {
    return this.run("publications.getBySlug", async () => {
      const { tenantId, siteId, slug } = data ?? {};
      if (!tenantId || !siteId || !slug) {
        throw missingParams("tenantId, siteId, slug");
      }
      const publication = await this.service.findBySlug(slug, siteId, tenantId);
      if (!publication) throw publicationNotFound();
      return { success: true, data: publication };
    });
  }

  @MessagePattern("publications.getById")
  async getById(@Payload() data: any, @Ctx() _ctx: RmqContext) {
    return this.run("publications.getById", async () => {
      const { tenantId, id } = data ?? {};
      if (!tenantId || !id) throw missingParams("tenantId, id");
      const publication = await this.service.findOne(id, tenantId);
      if (!publication) throw publicationNotFound();
      return { success: true, data: publication };
    });
  }

  @MessagePattern("publications.create")
  async create(@Payload() data: any, @Ctx() _ctx: RmqContext) {
    return this.run("publications.create", async () => {
      const { tenantId, shopId, ...input } = data ?? {};
      if (!tenantId || !shopId) throw missingParams("shopId");
      const result = await this.service.create({
        ...input,
        organizationId: tenantId,
        siteId: shopId,
      });
      return { success: true, data: result };
    });
  }

  @MessagePattern("publications.update")
  async update(@Payload() data: any, @Ctx() _ctx: RmqContext) {
    return this.run("publications.update", async () => {
      const { tenantId, id, ...updateData } = data ?? {};
      if (!tenantId || !id) throw missingParams("tenantId, id");
      const result = await this.service.update(id, tenantId, updateData);
      return { success: true, data: result };
    });
  }

  @MessagePattern("publications.delete")
  async delete(@Payload() data: any, @Ctx() _ctx: RmqContext) {
    return this.run("publications.delete", async () => {
      const { tenantId, id, shopId } = data ?? {};
      if (!tenantId || !id || !shopId) throw missingParams("shopId, id");
      await this.service.delete(id, tenantId, shopId);
      return { success: true };
    });
  }

  @MessagePattern("blogs.list")
  async listBlogs(@Payload() data: any, @Ctx() _ctx: RmqContext) {
    return this.run("blogs.list", async () => {
      const { tenantId, shopId } = data ?? {};
      if (!tenantId || !shopId) throw missingParams("shopId");
      return { success: true, data: await this.blogs.list(tenantId, shopId) };
    });
  }

  @MessagePattern("blogs.create")
  async createBlog(@Payload() data: any, @Ctx() _ctx: RmqContext) {
    return this.run("blogs.create", async () => {
      const { tenantId, shopId, title, handle } = data ?? {};
      if (!tenantId || !shopId) throw missingParams("shopId");
      const blog = await this.blogs.create({
        organizationId: tenantId,
        siteId: shopId,
        title,
        handle,
      });
      return { success: true, data: blog };
    });
  }

  @MessagePattern("blogs.update")
  async updateBlog(@Payload() data: any, @Ctx() _ctx: RmqContext) {
    return this.run("blogs.update", async () => {
      const { tenantId, shopId, id, title, handle } = data ?? {};
      if (!tenantId || !shopId || !id) throw missingParams("shopId, id");
      const blog = await this.blogs.update(id, {
        organizationId: tenantId,
        siteId: shopId,
        title,
        handle,
      });
      return { success: true, data: blog };
    });
  }
}
