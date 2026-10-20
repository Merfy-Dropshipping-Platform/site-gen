/**
 * RPC публикаций и блогов: ошибки уходят с кодом, полем и статусом (PUB-11),
 * чтобы шлюз отдал продавцу 400/404/409, а не 500 или голый текст.
 */
import { PublicationsMicroserviceController } from "../publications.controller";
import {
  PublicationError,
  publicationNotFound,
  toRpcFailure,
  uniqueViolationOf,
} from "../publications.errors";
import { assertTransition } from "../publication-rules";
import type { PublicationsService } from "../publications.service";
import type { BlogsService } from "../blogs.service";

const ctx = {} as never;

function make() {
  const service = {
    findPublished: jest.fn().mockResolvedValue([{ id: "p" }]),
    findAll: jest.fn().mockResolvedValue({ data: [{ id: "p" }], total: 1 }),
    findBySlug: jest.fn().mockResolvedValue(null),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: "new" }),
    update: jest.fn().mockResolvedValue({ id: "p" }),
    delete: jest.fn().mockResolvedValue(true),
  };
  const blogs = {
    list: jest.fn().mockResolvedValue([{ id: "b" }]),
    create: jest.fn().mockResolvedValue({ id: "b" }),
    update: jest.fn().mockResolvedValue({ id: "b" }),
  };
  const controller = new PublicationsMicroserviceController(
    service as unknown as PublicationsService,
    blogs as unknown as BlogsService,
  );
  return { controller, service, blogs };
}

describe("RPC публикаций и блогов", () => {
  it("успешные ответы — success: true с данными", async () => {
    const { controller, service, blogs } = make();
    expect(
      await controller.listPublished({ tenantId: "t", siteId: "s" }, ctx),
    ).toEqual({
      success: true,
      data: [{ id: "p" }],
    });
    expect(
      await controller.listAll(
        { tenantId: "t", siteId: "s", blogId: "b", status: "draft" },
        ctx,
      ),
    ).toEqual({ success: true, data: [{ id: "p" }], total: 1 });
    expect(service.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "t",
        siteId: "s",
        blogId: "b",
        status: "draft",
      }),
    );
    expect(
      await controller.create(
        { tenantId: "t", shopId: "s", title: "A", blogId: "b", seoTitle: "x" },
        ctx,
      ),
    ).toEqual({ success: true, data: { id: "new" } });
    expect(service.create).toHaveBeenCalledWith({
      title: "A",
      blogId: "b",
      seoTitle: "x",
      organizationId: "t",
      siteId: "s",
    });
    expect(
      await controller.update(
        { tenantId: "t", id: "p", shopId: "s", slug: "x" },
        ctx,
      ),
    ).toEqual({
      success: true,
      data: { id: "p" },
    });
    expect(service.update).toHaveBeenCalledWith("p", "t", {
      shopId: "s",
      slug: "x",
    });
    expect(
      await controller.delete({ tenantId: "t", id: "p", shopId: "s" }, ctx),
    ).toEqual({
      success: true,
    });
    expect(
      await controller.listBlogs({ tenantId: "t", shopId: "s" }, ctx),
    ).toEqual({
      success: true,
      data: [{ id: "b" }],
    });
    expect(blogs.list).toHaveBeenCalledWith("t", "s");
    await controller.createBlog(
      { tenantId: "t", shopId: "s", title: "Т", handle: "h" },
      ctx,
    );
    expect(blogs.create).toHaveBeenCalledWith({
      organizationId: "t",
      siteId: "s",
      title: "Т",
      handle: "h",
    });
    await controller.updateBlog(
      { tenantId: "t", shopId: "s", id: "b", title: "Н" },
      ctx,
    );
    expect(blogs.update).toHaveBeenCalledWith("b", {
      organizationId: "t",
      siteId: "s",
      title: "Н",
      handle: undefined,
    });
  });

  it("не найдено — 404 с кодом, top-level message прежний not_found", async () => {
    const { controller, service } = make();
    service.findOne.mockResolvedValue(null);
    expect(await controller.getById({ tenantId: "t", id: "x" }, ctx)).toEqual({
      success: false,
      message: "not_found",
      error: {
        code: "publication_not_found",
        message: expect.stringContaining("Запись не найдена"),
        status: 404,
      },
    });
    expect(
      await controller.getBySlug(
        { tenantId: "t", siteId: "s", slug: "x" },
        ctx,
      ),
    ).toMatchObject({
      success: false,
      error: { code: "publication_not_found", status: 404 },
    });
    service.findOne.mockResolvedValue({ id: "x" });
    expect(await controller.getById({ tenantId: "t", id: "x" }, ctx)).toEqual({
      success: true,
      data: { id: "x" },
    });
    service.findBySlug.mockResolvedValue({ id: "x" });
    expect(
      await controller.getBySlug(
        { tenantId: "t", siteId: "s", slug: "x" },
        ctx,
      ),
    ).toEqual({
      success: true,
      data: { id: "x" },
    });
  });

  it("ошибка сервиса с кодом — в error с полем и статусом", async () => {
    const { controller, service, blogs } = make();
    service.update.mockImplementation(() => {
      assertTransition("published", "scheduled");
    });
    const res = await controller.update(
      { tenantId: "t", id: "p", status: "scheduled" },
      ctx,
    );
    expect(res).toMatchObject({
      success: false,
      error: {
        code: "publication_transition_not_allowed",
        status: 409,
        field: "status",
      },
    });
    expect((res as { message: string }).message).toContain("Опубликована");
    blogs.update.mockRejectedValue(
      new PublicationError("blog_handle_taken", "занят", {
        status: 409,
        field: "handle",
      }),
    );
    expect(
      await controller.updateBlog(
        { tenantId: "t", shopId: "s", id: "b", handle: "x" },
        ctx,
      ),
    ).toEqual({
      success: false,
      message: "занят",
      error: {
        code: "blog_handle_taken",
        message: "занят",
        status: 409,
        field: "handle",
      },
    });
    service.delete.mockRejectedValue(publicationNotFound());
    expect(
      await controller.delete({ tenantId: "t", id: "p", shopId: "s" }, ctx),
    ).toMatchObject({
      error: { code: "publication_not_found", status: 404 },
    });
  });

  it("непредвиденная ошибка — 500 internal_error без подробностей", async () => {
    const { controller, service, blogs } = make();
    service.create.mockRejectedValue(new Error("connection reset"));
    const res = await controller.create(
      { tenantId: "t", shopId: "s", title: "A" },
      ctx,
    );
    expect(res).toEqual({
      success: false,
      message: "internal_error",
      error: {
        code: "internal_error",
        message: "Не удалось сохранить изменения. Попробуйте ещё раз.",
        status: 500,
      },
    });
    blogs.list.mockRejectedValue(new Error("boom"));
    expect(
      await controller.listBlogs({ tenantId: "t", shopId: "s" }, ctx),
    ).toMatchObject({
      error: { code: "internal_error", status: 500 },
    });
    service.findPublished.mockRejectedValue(new Error("boom"));
    expect(
      await controller.listPublished({ tenantId: "t", siteId: "s" }, ctx),
    ).toMatchObject({
      error: { status: 500 },
    });
    service.findAll.mockRejectedValue(new Error("boom"));
    expect(
      await controller.listAll({ tenantId: "t", siteId: "s" }, ctx),
    ).toMatchObject({
      error: { status: 500 },
    });
    blogs.create.mockRejectedValue(new Error("boom"));
    expect(
      await controller.createBlog(
        { tenantId: "t", shopId: "s", title: "x" },
        ctx,
      ),
    ).toMatchObject({
      error: { status: 500 },
    });
  });

  it.each([
    ["listPublished", {}],
    ["listAll", { tenantId: "t" }],
    ["getBySlug", { tenantId: "t", siteId: "s" }],
    ["getById", { tenantId: "t" }],
    ["create", { tenantId: "t", title: "A" }],
    ["update", { tenantId: "t" }],
    ["delete", { tenantId: "t", id: "p" }],
    ["listBlogs", { tenantId: "t" }],
    ["createBlog", { tenantId: "t", title: "A" }],
    ["updateBlog", { tenantId: "t", shopId: "s" }],
  ] as const)(
    "%s без обязательных полей — 400 validation_failed",
    async (method, payload) => {
      const { controller } = make();
      const res = await (
        controller[method] as (d: unknown, c: never) => Promise<unknown>
      )(payload, ctx);
      expect(res).toMatchObject({
        success: false,
        error: { code: "validation_failed", status: 400 },
      });
    },
  );

  it("uniqueViolationOf находит код 23505 и в cause", () => {
    expect(uniqueViolationOf({ code: "23505", constraint: "idx" })).toBe("idx");
    expect(
      uniqueViolationOf({ cause: { code: "23505", constraint: "c" } }),
    ).toBe("c");
    expect(uniqueViolationOf({ code: "23505" })).toBe("");
    expect(uniqueViolationOf(new Error("x"))).toBeNull();
    expect(toRpcFailure("строка").error.code).toBe("internal_error");
  });
});
