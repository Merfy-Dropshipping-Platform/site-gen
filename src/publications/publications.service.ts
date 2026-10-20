import { Inject, Injectable, Logger } from "@nestjs/common";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and, ne, sql, desc, asc, type SQL } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as schema from "../db/schema";
import { PG_CONNECTION } from "../constants";
import { BuildQueuePublisher } from "../rabbitmq/build-queue.service";
import {
  BlogsService,
  releasePaths,
  recordRedirects,
  type BlogRow,
  type Executor,
} from "./blogs.service";
import {
  EXCERPT_MAX,
  LEGACY_CATEGORY_BLOGS,
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
  assertTransition,
  autoExcerpt,
  optionalText,
  parseScheduledAt,
  parseStatus,
  publicationPath,
  requireFutureSchedule,
  requireTitle,
  slugify,
  validateSlug,
  type PublicationStatus,
} from "./publication-rules";
import {
  PublicationError,
  publicationNotFound,
  slugTaken,
  uniqueViolationOf,
} from "./publications.errors";

type PublicationRow = typeof schema.publications.$inferSelect;
type BlogRef = Pick<BlogRow, "id" | "title" | "handle">;

/** Запись в ответе API: без `category`, с блогом, анонсом для витрины и адресом. */
export interface PublicationView extends Omit<
  PublicationRow,
  "excerpt" | "status"
> {
  status: PublicationStatus;
  excerpt: string | null;
  excerptAuto: string;
  blog: BlogRef;
  url: string;
}

/** Поля записи, правка которых у опубликованной записи требует пересборки (PUB-5). */
const STOREFRONT_FIELDS = [
  "title",
  "content",
  "excerpt",
  "coverImageUrl",
  "slug",
  "blogId",
  "seoTitle",
  "seoDescription",
] as const;

/** Тело создания и правки (RPC). Значения проверяются здесь, а не в шлюзе. */
export interface PublicationInput {
  title?: unknown;
  content?: unknown;
  excerpt?: unknown;
  coverImageUrl?: unknown;
  status?: unknown;
  scheduledAt?: unknown;
  blogId?: unknown;
  newBlogTitle?: unknown;
  /** Устаревшее (news|blog|articles) — принимается на время выкатки. */
  category?: unknown;
  slug?: unknown;
  seoTitle?: unknown;
  seoDescription?: unknown;
}

export function toPublicationView(
  row: PublicationRow,
  blog: BlogRef,
): PublicationView {
  return {
    ...row,
    status: row.status as PublicationStatus,
    excerpt: row.excerpt ?? null,
    excerptAuto: autoExcerpt(row.content, row.excerpt),
    blog: { id: blog.id, title: blog.title, handle: blog.handle },
    url: publicationPath(blog.handle, row.slug),
  };
}

function textOrNull(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new PublicationError("validation_failed", "Ожидается текст.", {
      status: 400,
      field,
    });
  }
  return value;
}

function contentOf(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) return "";
  if (typeof value !== "string") {
    throw new PublicationError(
      "validation_failed",
      "Текст записи должен быть строкой.",
      { status: 400, field: "content" },
    );
  }
  return value;
}

@Injectable()
export class PublicationsService {
  private readonly logger = new Logger(PublicationsService.name);

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly buildQueue: BuildQueuePublisher,
    private readonly blogs: BlogsService,
  ) {}

  async create(
    params: PublicationInput & { organizationId: string; siteId: string },
  ): Promise<PublicationView> {
    const { organizationId, siteId } = params;
    const now = new Date();
    const title = requireTitle(params.title);
    const content = contentOf(params.content) ?? "";
    const excerpt =
      optionalText(
        params.excerpt,
        "excerpt",
        EXCERPT_MAX,
        "Краткое содержание",
      ) ?? null;
    const seoTitle =
      optionalText(
        params.seoTitle,
        "seoTitle",
        SEO_TITLE_MAX,
        "SEO-заголовок",
      ) ?? null;
    const seoDescription =
      optionalText(
        params.seoDescription,
        "seoDescription",
        SEO_DESCRIPTION_MAX,
        "SEO-описание",
      ) ?? null;
    const coverImageUrl =
      textOrNull(params.coverImageUrl, "coverImageUrl") ?? null;
    const status = parseStatus(params.status) ?? "draft";
    if (status === "archived") {
      throw new PublicationError(
        "validation_failed",
        "Новую запись нельзя сразу отправить в архив — сохраните её черновиком или опубликуйте.",
        { status: 400, field: "status" },
      );
    }
    const scheduledAt =
      status === "scheduled"
        ? requireFutureSchedule(parseScheduledAt(params.scheduledAt), now)
        : null;
    const explicitSlug =
      params.slug === undefined || params.slug === null || params.slug === ""
        ? undefined
        : validateSlug(params.slug);

    const { row, blog } = await this.withSlugRace(explicitSlug, () =>
      this.db.transaction(async (tx) => {
        const blog = (await this.blogs.resolveForWrite(
          tx,
          {
            organizationId,
            siteId,
            blogId: params.blogId,
            newBlogTitle: params.newBlogTitle,
            category: params.category,
          },
          true,
        )) as BlogRow;
        const slug = explicitSlug
          ? await this.assertSlugFree(tx, explicitSlug, siteId)
          : await this.uniqueSlug(tx, slugify(title), siteId);
        const [row] = await tx
          .insert(schema.publications)
          .values({
            id: randomUUID(),
            organizationId,
            siteId,
            blogId: blog.id,
            title,
            slug,
            content,
            excerpt,
            seoTitle,
            seoDescription,
            coverImageUrl,
            status,
            scheduledAt,
            publishedAt: status === "published" ? now : null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        await releasePaths(tx, siteId, [publicationPath(blog.handle, slug)]);
        return { row, blog };
      }),
    );

    if (status === "published") {
      await this.triggerRebuild(organizationId, siteId);
    }
    return toPublicationView(row, blog);
  }

  async findAll(params: {
    organizationId: string;
    siteId: string;
    status?: string;
    blogId?: string;
    /** Устаревший фильтр: категория → блог по таблице миграции. */
    category?: string;
    page?: number;
    limit?: number;
    sort?: string;
    publishedOnly?: boolean;
  }): Promise<{ data: PublicationView[]; total: number }> {
    const {
      organizationId,
      siteId,
      status,
      blogId,
      category,
      page = 1,
      limit = 20,
      sort = "createdAt:desc",
      publishedOnly = false,
    } = params;

    const conditions: SQL[] = [
      eq(schema.publications.organizationId, organizationId),
      eq(schema.publications.siteId, siteId),
    ];

    if (publishedOnly) {
      conditions.push(eq(schema.publications.status, "published"));
    } else if (status) {
      const parsed = parseStatus(status);
      if (parsed) conditions.push(eq(schema.publications.status, parsed));
    }
    if (blogId) conditions.push(eq(schema.publications.blogId, blogId));
    if (category) {
      const legacy = LEGACY_CATEGORY_BLOGS[category];
      // Неизвестная категория — пустой список, а не все записи.
      conditions.push(
        legacy ? eq(schema.blogs.handle, legacy.handle) : sql`false`,
      );
    }

    const [sortField, sortDir] = sort.split(":");
    const sortColumn =
      sortField === "publishedAt"
        ? schema.publications.publishedAt
        : sortField === "title"
          ? schema.publications.title
          : schema.publications.createdAt;
    const orderFn = sortDir === "asc" ? asc : desc;

    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
    const offset = (Math.max(1, Number(page) || 1) - 1) * safeLimit;

    const [rows, countResult] = await Promise.all([
      this.db
        .select({ pub: schema.publications, blog: blogRefColumns })
        .from(schema.publications)
        .innerJoin(
          schema.blogs,
          eq(schema.blogs.id, schema.publications.blogId),
        )
        .where(and(...conditions))
        .orderBy(orderFn(sortColumn))
        .limit(safeLimit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.publications)
        .innerJoin(
          schema.blogs,
          eq(schema.blogs.id, schema.publications.blogId),
        )
        .where(and(...conditions)),
    ]);

    return {
      data: rows.map((r) => toPublicationView(r.pub, r.blog)),
      total: countResult[0]?.count ?? 0,
    };
  }

  async findOne(
    id: string,
    organizationId: string,
  ): Promise<PublicationView | null> {
    const found = await this.findRow(this.db, id, organizationId);
    return found ? toPublicationView(found.pub, found.blog) : null;
  }

  async findBySlug(
    slug: string,
    siteId: string,
    organizationId: string,
  ): Promise<PublicationView | null> {
    const [result] = await this.db
      .select({ pub: schema.publications, blog: blogRefColumns })
      .from(schema.publications)
      .innerJoin(schema.blogs, eq(schema.blogs.id, schema.publications.blogId))
      .where(
        and(
          eq(schema.publications.slug, slug),
          eq(schema.publications.siteId, siteId),
          eq(schema.publications.organizationId, organizationId),
        ),
      )
      .limit(1);
    return result ? toPublicationView(result.pub, result.blog) : null;
  }

  /**
   * Правка записи. Без смены статуса допустима в любом статусе; смена статуса —
   * только по таблице переходов (иначе 409). Пересборка — по правилам PUB-5.
   */
  async update(
    id: string,
    organizationId: string,
    data: PublicationInput & { shopId?: unknown },
  ): Promise<PublicationView> {
    const found = await this.findRow(this.db, id, organizationId);
    if (!found) throw publicationNotFound();
    const { pub: existing, blog: existingBlog } = found;
    if (
      typeof data.shopId === "string" &&
      data.shopId &&
      data.shopId !== existing.siteId
    ) {
      throw publicationNotFound();
    }

    const now = new Date();
    const from = existing.status as PublicationStatus;
    const to = parseStatus(data.status) ?? from;
    assertTransition(from, to);

    const patch: Partial<PublicationRow> = {};
    if (data.title !== undefined) patch.title = requireTitle(data.title);
    const content = contentOf(data.content);
    if (content !== undefined) patch.content = content;
    // Анонс не пересчитывается из текста (PUB-12): null хранит «не задан».
    const excerpt = optionalText(
      data.excerpt,
      "excerpt",
      EXCERPT_MAX,
      "Краткое содержание",
    );
    if (excerpt !== undefined) patch.excerpt = excerpt;
    const seoTitle = optionalText(
      data.seoTitle,
      "seoTitle",
      SEO_TITLE_MAX,
      "SEO-заголовок",
    );
    if (seoTitle !== undefined) patch.seoTitle = seoTitle;
    const seoDescription = optionalText(
      data.seoDescription,
      "seoDescription",
      SEO_DESCRIPTION_MAX,
      "SEO-описание",
    );
    if (seoDescription !== undefined) patch.seoDescription = seoDescription;
    const coverImageUrl = textOrNull(data.coverImageUrl, "coverImageUrl");
    if (coverImageUrl !== undefined) patch.coverImageUrl = coverImageUrl;
    const slug =
      data.slug === undefined || data.slug === null || data.slug === ""
        ? undefined
        : validateSlug(data.slug);
    if (slug !== undefined) patch.slug = slug;

    // Дата нужна только записи по расписанию; у остальных она сбрасывается,
    // чтобы форма не открывала опубликованную запись «по расписанию» (PUB-4).
    const incomingSchedule = parseScheduledAt(data.scheduledAt);
    if (to === "scheduled") {
      const scheduleChanged =
        incomingSchedule !== undefined &&
        incomingSchedule?.getTime() !== existing.scheduledAt?.getTime();
      if (from !== "scheduled" || scheduleChanged) {
        patch.scheduledAt = requireFutureSchedule(
          incomingSchedule === undefined
            ? existing.scheduledAt
            : incomingSchedule,
          now,
        );
      }
    } else if (existing.scheduledAt !== null) {
      patch.scheduledAt = null;
    }

    if (to !== from) {
      patch.status = to;
      if (to === "published") patch.publishedAt = now;
    }

    const result = await this.withSlugRace(slug, () =>
      this.db.transaction(async (tx) => {
        const blog =
          (await this.blogs.resolveForWrite(
            tx,
            {
              organizationId,
              siteId: existing.siteId,
              blogId: data.blogId,
              newBlogTitle: data.newBlogTitle,
              category: data.category,
            },
            false,
          )) ?? existingBlog;
        if (blog.id !== existing.blogId) patch.blogId = blog.id;
        if (slug !== undefined && slug !== existing.slug) {
          await this.assertSlugFree(tx, slug, existing.siteId, existing.id);
        }

        const oldPath = publicationPath(existingBlog.handle, existing.slug);
        const newPath = publicationPath(blog.handle, slug ?? existing.slug);
        const [row] = await tx
          .update(schema.publications)
          .set({ ...patch, updatedAt: now })
          .where(
            and(
              eq(schema.publications.id, id),
              eq(schema.publications.organizationId, organizationId),
            ),
          )
          .returning();
        if (oldPath !== newPath) {
          await releasePaths(tx, existing.siteId, [newPath]);
          // Старый адрес нужен только той записи, что уже была на витрине.
          if (existing.publishedAt !== null) {
            await recordRedirects(tx, existing.siteId, [
              { publicationId: existing.id, oldPath },
            ]);
          }
        }
        return { row, blog };
      }),
    );

    if (needsRebuild(existing, result.row, from, to)) {
      await this.triggerRebuild(organizationId, existing.siteId);
    }
    return toPublicationView(result.row, result.blog);
  }

  async delete(id: string, organizationId: string, siteId: string) {
    const found = await this.findRow(this.db, id, organizationId);
    if (!found || found.pub.siteId !== siteId) throw publicationNotFound();

    await this.db
      .delete(schema.publications)
      .where(
        and(
          eq(schema.publications.id, id),
          eq(schema.publications.organizationId, organizationId),
        ),
      );

    if (found.pub.status === "published") {
      await this.triggerRebuild(organizationId, siteId);
    }

    return true;
  }

  // Used by publications.list RPC (storefront reads)
  async findPublished(
    siteId: string,
    organizationId: string,
  ): Promise<PublicationView[]> {
    const rows = await this.db
      .select({ pub: schema.publications, blog: blogRefColumns })
      .from(schema.publications)
      .innerJoin(schema.blogs, eq(schema.blogs.id, schema.publications.blogId))
      .where(
        and(
          eq(schema.publications.siteId, siteId),
          eq(schema.publications.organizationId, organizationId),
          eq(schema.publications.status, "published"),
        ),
      )
      .orderBy(desc(schema.publications.publishedAt));
    return rows.map((r) => toPublicationView(r.pub, r.blog));
  }

  /**
   * Cron: вышедшие по расписанию записи → published, publishedAt = now,
   * scheduledAt = null (PUB-4). Условный UPDATE: запись, которую в эту секунду
   * вернули в черновики, не публикуется.
   */
  async publishScheduled(now: Date = new Date()) {
    const published = await this.db
      .update(schema.publications)
      .set({
        status: "published",
        publishedAt: now,
        scheduledAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.publications.status, "scheduled"),
          sql`${schema.publications.scheduledAt} <= ${now}`,
        ),
      )
      .returning({
        id: schema.publications.id,
        title: schema.publications.title,
        organizationId: schema.publications.organizationId,
        siteId: schema.publications.siteId,
      });

    const affectedSites = new Map<string, { orgId: string; siteId: string }>();
    for (const pub of published) {
      affectedSites.set(`${pub.organizationId}:${pub.siteId}`, {
        orgId: pub.organizationId,
        siteId: pub.siteId,
      });
      this.logger.log(`Auto-published: ${pub.title} (${pub.id})`);
    }

    for (const { orgId, siteId } of affectedSites.values()) {
      await this.triggerRebuild(orgId, siteId);
    }

    return published.length;
  }

  private async findRow(
    ex: Executor,
    id: string,
    organizationId: string,
  ): Promise<{ pub: PublicationRow; blog: BlogRef } | undefined> {
    const [result] = await ex
      .select({ pub: schema.publications, blog: blogRefColumns })
      .from(schema.publications)
      .innerJoin(schema.blogs, eq(schema.blogs.id, schema.publications.blogId))
      .where(
        and(
          eq(schema.publications.id, id),
          eq(schema.publications.organizationId, organizationId),
        ),
      )
      .limit(1);
    return result;
  }

  /** Заданный продавцом адрес: занят другой записью магазина → 409. */
  private async assertSlugFree(
    ex: Executor,
    slug: string,
    siteId: string,
    exceptId?: string,
  ): Promise<string> {
    const conditions = [
      eq(schema.publications.slug, slug),
      eq(schema.publications.siteId, siteId),
    ];
    if (exceptId) conditions.push(ne(schema.publications.id, exceptId));
    const [existing] = await ex
      .select({ id: schema.publications.id })
      .from(schema.publications)
      .where(and(...conditions))
      .limit(1);
    if (existing) throw slugTaken(slug);
    return slug;
  }

  /** Адрес из заголовка: занят — `-1`, `-2`… */
  private async uniqueSlug(
    ex: Executor,
    baseSlug: string,
    siteId: string,
  ): Promise<string> {
    const slug = baseSlug || "publication";
    let suffix = 0;

    while (true) {
      const candidate = suffix === 0 ? slug : `${slug}-${suffix}`;
      const [existing] = await ex
        .select({ id: schema.publications.id })
        .from(schema.publications)
        .where(
          and(
            eq(schema.publications.slug, candidate),
            eq(schema.publications.siteId, siteId),
          ),
        )
        .limit(1);

      if (!existing) return candidate;
      suffix++;
    }
  }

  /**
   * Гонка двух сохранений с одним адресом: уникальный индекс отбивает второе.
   * Заданный продавцом адрес → 409 slug_taken; адрес из заголовка — ещё попытка.
   */
  private async withSlugRace<T>(
    explicitSlug: string | undefined,
    work: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await work();
      } catch (err) {
        if (uniqueViolationOf(err) !== "idx_publications_slug_site") throw err;
        if (explicitSlug || attempt >= 2) throw slugTaken(explicitSlug ?? "");
      }
    }
  }

  private async triggerRebuild(tenantId: string, siteId: string) {
    try {
      await this.buildQueue.queueBuild({
        tenantId,
        siteId,
        priority: 5,
        trigger: "publication_change",
      });
      this.logger.log(`Rebuild queued for site ${siteId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to queue rebuild: ${msg}`);
    }
  }
}

const blogRefColumns = {
  id: schema.blogs.id,
  title: schema.blogs.title,
  handle: schema.blogs.handle,
};

/**
 * Пересборка (PUB-5, PUB-7, PUB-8): запись вышла на витрину, ушла с неё, или у
 * опубликованной записи изменилось поле, которое видно на витрине.
 */
export function needsRebuild(
  before: PublicationRow,
  after: PublicationRow,
  from: PublicationStatus,
  to: PublicationStatus,
): boolean {
  if (from !== to) return to === "published" || from === "published";
  if (to !== "published") return false;
  return STOREFRONT_FIELDS.some((field) => before[field] !== after[field]);
}
