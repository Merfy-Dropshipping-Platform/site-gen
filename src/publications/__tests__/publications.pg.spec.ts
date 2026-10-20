/**
 * Блоги и записи на НАСТОЯЩЕМ Postgres (контракт «Публикации», PUB-3/4/5/7/8/10/11/12).
 *
 * База — `SITES_TEST_DATABASE_URL`, только одноразовая (`openDisposableDatabase`
 * накатывает миграции, включая 0027). Каждый тест — свой магазин с id
 * `pubsvc-…`; после набора удаляются только такие строки. Очередь сборок —
 * заглушка: проверяем, ставится ли пересборка `publication_change`.
 */
import type { Pool } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, like } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as schema from "../../db/schema";
import { openDisposableDatabase } from "../../store/__tests__/support/test-database";
import { BlogsService, insertDefaultBlog } from "../blogs.service";
import { PublicationsService } from "../publications.service";
import { PublicationError } from "../publications.errors";
import type { BuildQueuePublisher } from "../../rabbitmq/build-queue.service";

const url = process.env.SITES_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
if (!url) {
  console.warn(
    "publications.pg.spec: SITES_TEST_DATABASE_URL не задан — проверки блогов и записей на Postgres ПРОПУЩЕНЫ",
  );
}

const P = "pubsvc-";
const ORG = `${P}org`;
const FUTURE = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

let pool: InstanceType<typeof Pool>;
let db: NodePgDatabase<typeof schema>;
let queueBuild: jest.Mock;
let blogs: BlogsService;
let pubs: PublicationsService;

function newSite(): string {
  return `${P}${randomUUID()}`;
}

async function failure(promise: Promise<unknown>): Promise<PublicationError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof PublicationError) return e;
    throw e;
  }
  throw new Error("ожидалась PublicationError");
}

function rebuildsFor(siteId: string): number {
  return queueBuild.mock.calls.filter(
    ([arg]) => arg.siteId === siteId && arg.trigger === "publication_change",
  ).length;
}

async function redirectsOf(siteId: string) {
  const rows = await db
    .select()
    .from(schema.publicationRedirects)
    .where(eq(schema.publicationRedirects.siteId, siteId));
  return rows.map((r) => [r.oldPath, r.publicationId]).sort();
}

suite("блоги и записи на Postgres", () => {
  beforeAll(async () => {
    const opened = await openDisposableDatabase(url!);
    pool = opened.pool;
    db = opened.db;
  });

  beforeEach(() => {
    queueBuild = jest.fn().mockResolvedValue(undefined);
    const buildQueue = { queueBuild } as unknown as BuildQueuePublisher;
    blogs = new BlogsService(db, buildQueue);
    pubs = new PublicationsService(db, buildQueue, blogs);
  });

  afterAll(async () => {
    if (!db) return;
    await db
      .delete(schema.publications)
      .where(like(schema.publications.siteId, `${P}%`));
    await db.delete(schema.blogs).where(like(schema.blogs.siteId, `${P}%`));
    await pool.end();
  });

  describe("блоги (PUB-3)", () => {
    it("список досоздаёт «Новости» и отдаёт блоги по дате создания со счётчиками", async () => {
      const site = newSite();
      const first = await blogs.list(ORG, site);
      expect(first).toEqual([
        expect.objectContaining({
          title: "Новости",
          handle: "novosti",
          publicationsCount: 0,
          publishedCount: 0,
        }),
      ]);
      const blog = await blogs.create({
        organizationId: ORG,
        siteId: site,
        title: "Мой блог",
      });
      expect(blog).toMatchObject({
        title: "Мой блог",
        handle: "moj-blog",
        publicationsCount: 0,
      });
      await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "A",
        blogId: blog.id,
        status: "published",
      });
      await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "B",
        blogId: blog.id,
      });
      const list = await blogs.list(ORG, site);
      expect(
        list.map((b) => [b.handle, b.publicationsCount, b.publishedCount]),
      ).toEqual([
        ["novosti", 0, 0],
        ["moj-blog", 2, 1],
      ]);
      expect(await blogs.list(`${P}other-org`, site)).toEqual([]);
    });

    it("создание магазина ставит «Новости» (insertDefaultBlog) — повтор не ошибка", async () => {
      const site = newSite();
      await insertDefaultBlog(db, { siteId: site, organizationId: ORG });
      await insertDefaultBlog(db, { siteId: site, organizationId: ORG });
      const rows = await db
        .select()
        .from(schema.blogs)
        .where(eq(schema.blogs.siteId, site));
      expect(rows.map((r) => [r.title, r.handle])).toEqual([
        ["Новости", "novosti"],
      ]);
    });

    it("адрес из названия: транслит, при занятости -2, -3; пустой транслит — blog", async () => {
      const site = newSite();
      const a = await blogs.create({
        organizationId: ORG,
        siteId: site,
        title: "Акции",
      });
      const b = await blogs.create({
        organizationId: ORG,
        siteId: site,
        title: "Акции",
      });
      const c = await blogs.create({
        organizationId: ORG,
        siteId: site,
        title: "акции!",
      });
      const d = await blogs.create({
        organizationId: ORG,
        siteId: site,
        title: "???",
      });
      expect([a.handle, b.handle, c.handle, d.handle]).toEqual([
        "aktsii",
        "aktsii-2",
        "aktsii-3",
        "blog",
      ]);
    });

    it("заданный адрес: занят — 409 blog_handle_taken (field handle), неверный — 400, пустое название — 400", async () => {
      const site = newSite();
      await blogs.create({
        organizationId: ORG,
        siteId: site,
        title: "X",
        handle: "promo",
      });
      const taken = await failure(
        blogs.create({
          organizationId: ORG,
          siteId: site,
          title: "Y",
          handle: "promo",
        }),
      );
      expect([taken.code, taken.status, taken.field]).toEqual([
        "blog_handle_taken",
        409,
        "handle",
      ]);
      const bad = await failure(
        blogs.create({
          organizationId: ORG,
          siteId: site,
          title: "Y",
          handle: "Promo!",
        }),
      );
      expect([bad.code, bad.status, bad.field]).toEqual([
        "validation_failed",
        400,
        "handle",
      ]);
      const empty = await failure(
        blogs.create({ organizationId: ORG, siteId: site, title: " " }),
      );
      expect([empty.code, empty.field]).toEqual(["validation_failed", "title"]);
    });

    it("правка названия и адреса; занятый адрес — 409; чужой блог — 404", async () => {
      const site = newSite();
      const blog = await blogs.create({
        organizationId: ORG,
        siteId: site,
        title: "Акции",
      });
      await blogs.create({
        organizationId: ORG,
        siteId: site,
        title: "Занят",
        handle: "zanyat",
      });
      const renamed = await blogs.update(blog.id, {
        organizationId: ORG,
        siteId: site,
        title: "Скидки",
        handle: "skidki",
      });
      expect(renamed).toMatchObject({
        id: blog.id,
        title: "Скидки",
        handle: "skidki",
      });
      const taken = await failure(
        blogs.update(blog.id, {
          organizationId: ORG,
          siteId: site,
          handle: "zanyat",
        }),
      );
      expect([taken.code, taken.status, taken.field]).toEqual([
        "blog_handle_taken",
        409,
        "handle",
      ]);
      const foreign = await failure(
        blogs.update(blog.id, {
          organizationId: `${P}other`,
          siteId: site,
          title: "Чужое",
        }),
      );
      expect([foreign.code, foreign.status]).toEqual(["blog_not_found", 404]);
      const otherShop = await failure(
        blogs.update(blog.id, {
          organizationId: ORG,
          siteId: newSite(),
          title: "Чужое",
        }),
      );
      expect(otherShop.code).toBe("blog_not_found");
      // Без опубликованных записей переименование не пересобирает сайт.
      expect(rebuildsFor(site)).toBe(0);
    });

    it("переименование и смена адреса блога с опубликованными записями — пересборка и прежние адреса", async () => {
      const site = newSite();
      const blog = await blogs.create({
        organizationId: ORG,
        siteId: site,
        title: "Акции",
      });
      const live = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "Распродажа",
        blogId: blog.id,
        status: "published",
      });
      await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "Черновик",
        blogId: blog.id,
      });
      queueBuild.mockClear();

      await blogs.update(blog.id, {
        organizationId: ORG,
        siteId: site,
        title: "Скидки",
      });
      expect(rebuildsFor(site)).toBe(1);

      await blogs.update(blog.id, {
        organizationId: ORG,
        siteId: site,
        handle: "skidki",
      });
      expect(rebuildsFor(site)).toBe(2);
      // Прежний адрес — только у записи, что была на витрине.
      expect(await redirectsOf(site)).toEqual([
        ["/blogs/aktsii/rasprodazha", live.id],
      ]);
      const after = await pubs.findOne(live.id, ORG);
      expect(after?.url).toBe("/blogs/skidki/rasprodazha");
    });
  });

  describe("создание записи", () => {
    it("без блога — блог по умолчанию; excerpt null, excerptAuto, url, blog в ответе, без category", async () => {
      const site = newSite();
      const content = `<p>${"Слово ".repeat(50)}</p>`;
      const pub = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "Первая запись",
        content,
      });
      expect(pub).toMatchObject({
        status: "draft",
        slug: "pervaya-zapis",
        excerpt: null,
        seoTitle: null,
        seoDescription: null,
        blog: { handle: "novosti", title: "Новости" },
        url: "/blogs/novosti/pervaya-zapis",
        scheduledAt: null,
        publishedAt: null,
      });
      expect(pub.blogId).toBe(pub.blog.id);
      expect(pub).not.toHaveProperty("category");
      expect(pub.excerptAuto.endsWith("…")).toBe(true);
      expect(pub.excerptAuto.length).toBeLessThanOrEqual(201);
      expect(rebuildsFor(site)).toBe(0);
    });

    it("newBlogTitle — блог создаётся вместе с записью; пустой — 400 newBlogTitle", async () => {
      const site = newSite();
      const pub = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "Запись",
        newBlogTitle: "Советы стилиста",
      });
      expect(pub.blog).toMatchObject({
        title: "Советы стилиста",
        handle: "sovety-stilista",
      });
      const err = await failure(
        pubs.create({
          organizationId: ORG,
          siteId: site,
          title: "Запись 2",
          newBlogTitle: "  ",
        }),
      );
      expect([err.code, err.status, err.field]).toEqual([
        "validation_failed",
        400,
        "newBlogTitle",
      ]);
    });

    it("ошибка записи откатывает созданный в той же транзакции блог", async () => {
      const site = newSite();
      await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "A",
        slug: "zanyato",
      });
      const err = await failure(
        pubs.create({
          organizationId: ORG,
          siteId: site,
          title: "B",
          slug: "zanyato",
          newBlogTitle: "Не должен остаться",
        }),
      );
      expect(err.code).toBe("slug_taken");
      const rows = await db
        .select()
        .from(schema.blogs)
        .where(eq(schema.blogs.siteId, site));
      expect(rows.map((r) => r.handle)).toEqual(["novosti"]);
    });

    it("устаревшая category превращается в блог по таблице (создаётся при отсутствии)", async () => {
      const site = newSite();
      const a = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "A",
        category: "articles",
      });
      const b = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "B",
        category: "articles",
      });
      const n = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "N",
        category: "news",
      });
      expect([a.blog.handle, b.blog.handle, n.blog.handle]).toEqual([
        "stati",
        "stati",
        "novosti",
      ]);
      expect(a.blog.title).toBe("Статьи");
      expect(a.blogId).toBe(b.blogId);
      const bad = await failure(
        pubs.create({
          organizationId: ORG,
          siteId: site,
          title: "X",
          category: "memes",
        }),
      );
      expect(bad.code).toBe("validation_failed");
    });

    it("чужой или несуществующий blogId — 404 blog_not_found", async () => {
      const site = newSite();
      const foreign = await blogs.create({
        organizationId: ORG,
        siteId: newSite(),
        title: "Чужой",
      });
      for (const blogId of [foreign.id, randomUUID()]) {
        const err = await failure(
          pubs.create({
            organizationId: ORG,
            siteId: site,
            title: "X",
            blogId,
          }),
        );
        expect([err.code, err.status, err.field]).toEqual([
          "blog_not_found",
          404,
          "blogId",
        ]);
      }
    });

    it("проверки полей — 400 validation_failed с field", async () => {
      const site = newSite();
      const cases: [Record<string, unknown>, string][] = [
        [{ title: "" }, "title"],
        [{ title: "X", slug: "Плохой адрес" }, "slug"],
        [{ title: "X", seoTitle: "a".repeat(71) }, "seoTitle"],
        [{ title: "X", seoDescription: "a".repeat(161) }, "seoDescription"],
        [{ title: "X", excerpt: "a".repeat(501) }, "excerpt"],
        [{ title: "X", status: "scheduled" }, "scheduledAt"],
        [
          {
            title: "X",
            status: "scheduled",
            scheduledAt: "2020-01-01T00:00:00.000Z",
          },
          "scheduledAt",
        ],
        [{ title: "X", status: "archived" }, "status"],
        [{ title: "X", status: "deleted" }, "status"],
      ];
      for (const [input, field] of cases) {
        const err = await failure(
          pubs.create({ organizationId: ORG, siteId: site, ...input }),
        );
        expect([err.code, err.status, err.field]).toEqual([
          "validation_failed",
          400,
          field,
        ]);
      }
    });

    it("SEO-поля и анонс сохраняются; публикация сразу ставит пересборку", async () => {
      const site = newSite();
      const pub = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "Запись",
        content: "<p>Длинный текст</p>",
        excerpt: "Мой анонс",
        seoTitle: "SEO заголовок",
        seoDescription: "SEO описание",
        slug: "moj-adres",
        status: "published",
      });
      expect(pub).toMatchObject({
        excerpt: "Мой анонс",
        excerptAuto: "Мой анонс",
        seoTitle: "SEO заголовок",
        seoDescription: "SEO описание",
        slug: "moj-adres",
        status: "published",
      });
      expect(pub.publishedAt).toBeInstanceOf(Date);
      expect(rebuildsFor(site)).toBe(1);
    });

    it("адрес из заголовка при занятости получает суффикс; заданный и занятый — 409 slug_taken", async () => {
      const site = newSite();
      const a = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "Новинки",
      });
      const b = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "Новинки",
      });
      expect([a.slug, b.slug]).toEqual(["novinki", "novinki-1"]);
      const err = await failure(
        pubs.create({
          organizationId: ORG,
          siteId: site,
          title: "Другое",
          slug: "novinki",
        }),
      );
      expect([err.code, err.status, err.field]).toEqual([
        "slug_taken",
        409,
        "slug",
      ]);
    });
  });

  describe("правка и статусы", () => {
    it("правка текста не затирает заданный анонс; null очищает его (PUB-12)", async () => {
      const site = newSite();
      const pub = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "A",
        content: "<p>Старый</p>",
        excerpt: "Анонс продавца",
      });
      const edited = await pubs.update(pub.id, ORG, {
        content: "<p>Новый текст</p>",
      });
      expect(edited.excerpt).toBe("Анонс продавца");
      const cleared = await pubs.update(pub.id, ORG, { excerpt: null });
      expect(cleared.excerpt).toBeNull();
      expect(cleared.excerptAuto).toBe("Новый текст");
      const notSet = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "B",
        content: "<p>x</p>",
      });
      const notSetEdited = await pubs.update(notSet.id, ORG, {
        content: "<p>y</p>",
      });
      expect(notSetEdited.excerpt).toBeNull();
      expect(notSetEdited.excerptAuto).toBe("y");
    });

    it("правка опубликованной записи без смены статуса сохраняется и пересобирает сайт (PUB-4, PUB-5)", async () => {
      const site = newSite();
      const pub = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "A",
        status: "published",
      });
      queueBuild.mockClear();
      const edited = await pubs.update(pub.id, ORG, {
        title: "B",
        status: "published",
      });
      expect(edited).toMatchObject({ title: "B", status: "published" });
      expect(rebuildsFor(site)).toBe(1);
      await pubs.update(pub.id, ORG, { title: "B" });
      expect(rebuildsFor(site)).toBe(1);
      for (const [field, value] of [
        ["content", "<p>новый</p>"],
        ["excerpt", "анонс"],
        ["coverImageUrl", "https://cdn/x.jpg"],
        ["seoTitle", "seo"],
        ["seoDescription", "seo d"],
      ] as const) {
        queueBuild.mockClear();
        await pubs.update(pub.id, ORG, { [field]: value });
        expect(rebuildsFor(site)).toBe(1);
      }
      const other = await blogs.create({
        organizationId: ORG,
        siteId: site,
        title: "Другой",
      });
      queueBuild.mockClear();
      const moved = await pubs.update(pub.id, ORG, { blogId: other.id });
      expect(moved.blog.handle).toBe("drugoj");
      expect(rebuildsFor(site)).toBe(1);
    });

    it("правка черновика не пересобирает сайт", async () => {
      const site = newSite();
      const pub = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "A",
      });
      await pubs.update(pub.id, ORG, { title: "B", content: "<p>c</p>" });
      expect(rebuildsFor(site)).toBe(0);
    });

    it("published → scheduled — 409 с кодом и русским текстом; запись не меняется", async () => {
      const site = newSite();
      const pub = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "A",
        status: "published",
      });
      const err = await failure(
        pubs.update(pub.id, ORG, {
          status: "scheduled",
          scheduledAt: FUTURE(),
          title: "B",
        }),
      );
      expect([err.code, err.status]).toEqual([
        "publication_transition_not_allowed",
        409,
      ]);
      expect(err.message).toContain("«Опубликована»");
      expect((await pubs.findOne(pub.id, ORG))?.title).toBe("A");
    });

    it("published → draft (PUB-7) и published → archived → draft (PUB-8) с пересборкой при уходе с витрины", async () => {
      const site = newSite();
      const pub = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "A",
        status: "published",
      });
      queueBuild.mockClear();
      expect((await pubs.update(pub.id, ORG, { status: "draft" })).status).toBe(
        "draft",
      );
      expect(rebuildsFor(site)).toBe(1);
      await pubs.update(pub.id, ORG, { status: "published" });
      expect(rebuildsFor(site)).toBe(2);
      expect(
        (await pubs.update(pub.id, ORG, { status: "archived" })).status,
      ).toBe("archived");
      expect(rebuildsFor(site)).toBe(3);
      const err = await failure(
        pubs.update(pub.id, ORG, { status: "published" }),
      );
      expect(err.code).toBe("publication_transition_not_allowed");
      expect((await pubs.update(pub.id, ORG, { status: "draft" })).status).toBe(
        "draft",
      );
      expect(rebuildsFor(site)).toBe(3);
    });

    it("scheduled: смена даты, прошлое время — 400, возврат в черновик сбрасывает дату", async () => {
      const site = newSite();
      const first = FUTURE();
      const pub = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "A",
        status: "scheduled",
        scheduledAt: first,
      });
      expect(pub.scheduledAt?.toISOString()).toBe(first);
      const later = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const moved = await pubs.update(pub.id, ORG, { scheduledAt: later });
      expect(moved.scheduledAt?.toISOString()).toBe(later);
      // Та же дата повторно (форма шлёт её при каждом сохранении) — не ошибка.
      await pubs.update(pub.id, ORG, {
        scheduledAt: later,
        title: "B",
        status: "scheduled",
      });
      const past = await failure(
        pubs.update(pub.id, ORG, { scheduledAt: "2020-01-01T00:00:00.000Z" }),
      );
      expect([past.code, past.field]).toEqual([
        "validation_failed",
        "scheduledAt",
      ]);
      const draft = await pubs.update(pub.id, ORG, { status: "draft" });
      expect(draft.scheduledAt).toBeNull();
      const noDate = await failure(
        pubs.update(pub.id, ORG, { status: "scheduled" }),
      );
      expect(noDate.field).toBe("scheduledAt");
    });

    it("publishScheduled: published, publishedAt = now, scheduledAt = null; после этого правка сохраняется (PUB-4)", async () => {
      const site = newSite();
      const pub = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "По расписанию",
        status: "scheduled",
        scheduledAt: FUTURE(),
      });
      queueBuild.mockClear();
      const at = new Date(Date.now() + 2 * 60 * 60 * 1000);
      expect(await pubs.publishScheduled(at)).toBeGreaterThanOrEqual(1);
      const after = await pubs.findOne(pub.id, ORG);
      expect(after).toMatchObject({ status: "published", scheduledAt: null });
      expect(after?.publishedAt?.getTime()).toBe(at.getTime());
      expect(rebuildsFor(site)).toBe(1);
      // Форма после выхода шлёт статус записи, а не «по расписанию».
      const edited = await pubs.update(pub.id, ORG, {
        content: "<p>правка</p>",
        status: "published",
      });
      expect(edited.content).toBe("<p>правка</p>");
      expect(rebuildsFor(site)).toBe(2);
    });

    it("смена slug у опубликованной записи: проверка, 409 на занятый, прежний адрес сохраняется (PUB-10)", async () => {
      const site = newSite();
      const pub = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "Старый",
        status: "published",
      });
      const other = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "Занят",
      });
      const taken = await failure(
        pubs.update(pub.id, ORG, { slug: other.slug }),
      );
      expect([taken.code, taken.status, taken.field]).toEqual([
        "slug_taken",
        409,
        "slug",
      ]);
      const bad = await failure(pubs.update(pub.id, ORG, { slug: "Новый" }));
      expect([bad.code, bad.field]).toEqual(["validation_failed", "slug"]);
      queueBuild.mockClear();
      const moved = await pubs.update(pub.id, ORG, { slug: "novyj" });
      expect(moved.url).toBe("/blogs/novosti/novyj");
      expect(rebuildsFor(site)).toBe(1);
      expect(await redirectsOf(site)).toEqual([
        ["/blogs/novosti/staryj", pub.id],
      ]);
      // Тот же slug у себя самой — не «занят».
      await pubs.update(pub.id, ORG, { slug: "novyj" });
      // Новая запись занимает старый адрес — редирект с него снимается.
      await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "X",
        slug: "staryj",
      });
      expect(await redirectsOf(site)).toEqual([]);
    });

    it("смена slug у черновика, который не бывал на витрине, прежний адрес не хранит", async () => {
      const site = newSite();
      const pub = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "Черновик",
      });
      await pubs.update(pub.id, ORG, { slug: "drugoj" });
      expect(await redirectsOf(site)).toEqual([]);
    });

    it("не найдена, чужая или из другого магазина — 404 publication_not_found", async () => {
      const site = newSite();
      const pub = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "A",
      });
      for (const call of [
        () => pubs.update(randomUUID(), ORG, { title: "x" }),
        () => pubs.update(pub.id, `${P}other`, { title: "x" }),
        () => pubs.update(pub.id, ORG, { title: "x", shopId: newSite() }),
        () => pubs.delete(pub.id, ORG, newSite()),
        () => pubs.delete(randomUUID(), ORG, site),
      ]) {
        const err = await failure(call());
        expect([err.code, err.status]).toEqual(["publication_not_found", 404]);
      }
    });

    it("удаление опубликованной записи пересобирает сайт, черновика — нет", async () => {
      const site = newSite();
      const live = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "A",
        status: "published",
      });
      const draft = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "B",
      });
      queueBuild.mockClear();
      await pubs.delete(draft.id, ORG, site);
      expect(rebuildsFor(site)).toBe(0);
      await pubs.delete(live.id, ORG, site);
      expect(rebuildsFor(site)).toBe(1);
      expect(await pubs.findOne(live.id, ORG)).toBeNull();
    });
  });

  describe("чтение", () => {
    it("список: фильтры по блогу, статусу и устаревшей категории; страницы; findBySlug и findPublished", async () => {
      const site = newSite();
      const news = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "N",
        status: "published",
      });
      const art = await pubs.create({
        organizationId: ORG,
        siteId: site,
        title: "A",
        category: "articles",
      });
      const all = await pubs.findAll({ organizationId: ORG, siteId: site });
      expect(all.total).toBe(2);
      const byBlog = await pubs.findAll({
        organizationId: ORG,
        siteId: site,
        blogId: art.blogId,
      });
      expect(byBlog.data.map((p) => p.id)).toEqual([art.id]);
      const byCategory = await pubs.findAll({
        organizationId: ORG,
        siteId: site,
        category: "news",
      });
      expect(byCategory.data.map((p) => p.id)).toEqual([news.id]);
      const unknown = await pubs.findAll({
        organizationId: ORG,
        siteId: site,
        category: "memes",
      });
      expect(unknown.total).toBe(0);
      const published = await pubs.findAll({
        organizationId: ORG,
        siteId: site,
        status: "published",
      });
      expect(published.data.map((p) => p.id)).toEqual([news.id]);
      const onlyPublished = await pubs.findAll({
        organizationId: ORG,
        siteId: site,
        publishedOnly: true,
      });
      expect(onlyPublished.total).toBe(1);
      const paged = await pubs.findAll({
        organizationId: ORG,
        siteId: site,
        page: 2,
        limit: 1,
        sort: "title:asc",
      });
      expect(paged.data.map((p) => p.title)).toEqual(["N"]);
      expect(paged.total).toBe(2);
      const byPublishedAt = await pubs.findAll({
        organizationId: ORG,
        siteId: site,
        sort: "publishedAt:desc",
      });
      expect(byPublishedAt.total).toBe(2);
      expect((await pubs.findBySlug(art.slug, site, ORG))?.blog.handle).toBe(
        "stati",
      );
      expect(await pubs.findBySlug("net-takoj", site, ORG)).toBeNull();
      const live = await pubs.findPublished(site, ORG);
      expect(live.map((p) => [p.id, p.url])).toEqual([
        [news.id, `/blogs/novosti/${news.slug}`],
      ]);
    });
  });
});
