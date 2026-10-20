/**
 * Блоги магазина (контракт «Публикации», PUB-3).
 *
 * Блог «Новости» (`novosti`) есть у каждого магазина: его ставит создание
 * магазина (`insertDefaultBlog`), миграция 0027 — всем прежним, а список и
 * запись без блога досоздают его, если магазин появился в обход (старый путь
 * `reserve`, ручные строки).
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as schema from "../db/schema";
import { PG_CONNECTION } from "../constants";
import { BuildQueuePublisher } from "../rabbitmq/build-queue.service";
import {
  BLOG_TITLE_MAX,
  DEFAULT_BLOG,
  LEGACY_CATEGORY_BLOGS,
  publicationPath,
  requireTitle,
  slugify,
  validateSlug,
} from "./publication-rules";
import {
  PublicationError,
  blogHandleTaken,
  blogNotFound,
  uniqueViolationOf,
} from "./publications.errors";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Executor = Db | Tx;

export type BlogRow = typeof schema.blogs.$inferSelect;

export interface BlogView {
  id: string;
  title: string;
  handle: string;
  publicationsCount: number;
  publishedCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Сколько раз пробовать следующий суффикс адреса при гонке вставок. */
const HANDLE_ATTEMPTS = 50;

/**
 * Блог «Новости» магазина. Повтор не ошибка (ON CONFLICT DO NOTHING):
 * вызывается и при создании магазина, и при досоздании.
 */
export async function insertDefaultBlog(
  ex: Executor,
  params: { siteId: string; organizationId: string },
): Promise<void> {
  const now = new Date();
  await ex
    .insert(schema.blogs)
    .values({
      id: randomUUID(),
      siteId: params.siteId,
      organizationId: params.organizationId,
      title: DEFAULT_BLOG.title,
      handle: DEFAULT_BLOG.handle,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [schema.blogs.siteId, schema.blogs.handle],
    });
}

/**
 * Записать прежние адреса записей (для 301) и снять адреса, которые снова
 * заняты живой записью. `moves` — запись и её прежний путь.
 */
export async function recordRedirects(
  ex: Executor,
  siteId: string,
  moves: { publicationId: string; oldPath: string }[],
): Promise<void> {
  if (moves.length === 0) return;
  const now = new Date();
  await ex
    .insert(schema.publicationRedirects)
    .values(
      moves.map((m) => ({
        siteId,
        oldPath: m.oldPath,
        publicationId: m.publicationId,
        createdAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [
        schema.publicationRedirects.siteId,
        schema.publicationRedirects.oldPath,
      ],
      set: {
        publicationId: sql`excluded.publication_id`,
        createdAt: now,
      },
    });
}

/** Путь снова занят живой записью — старый редирект с него снимается. */
export async function releasePaths(
  ex: Executor,
  siteId: string,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  await ex
    .delete(schema.publicationRedirects)
    .where(
      and(
        eq(schema.publicationRedirects.siteId, siteId),
        inArray(schema.publicationRedirects.oldPath, paths),
      ),
    );
}

@Injectable()
export class BlogsService {
  private readonly logger = new Logger(BlogsService.name);

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: Db,
    private readonly buildQueue: BuildQueuePublisher,
  ) {}

  /** Блоги магазина по дате создания, со счётчиками записей. */
  async list(organizationId: string, siteId: string): Promise<BlogView[]> {
    await insertDefaultBlog(this.db, { siteId, organizationId });
    const rows = await this.db
      .select({
        blog: schema.blogs,
        publicationsCount: sql<number>`count(${schema.publications.id})::int`,
        publishedCount: sql<number>`count(${schema.publications.id}) filter (where ${schema.publications.status} = 'published')::int`,
      })
      .from(schema.blogs)
      .leftJoin(
        schema.publications,
        eq(schema.publications.blogId, schema.blogs.id),
      )
      .where(
        and(
          eq(schema.blogs.organizationId, organizationId),
          eq(schema.blogs.siteId, siteId),
        ),
      )
      .groupBy(schema.blogs.id)
      .orderBy(asc(schema.blogs.createdAt), asc(schema.blogs.handle));
    return rows.map((r) =>
      toView(r.blog, r.publicationsCount, r.publishedCount),
    );
  }

  async create(params: {
    organizationId: string;
    siteId: string;
    title: unknown;
    handle?: unknown;
  }): Promise<BlogView> {
    const blog = await this.insertBlog(this.db, {
      organizationId: params.organizationId,
      siteId: params.siteId,
      title: requireTitle(params.title, "title", BLOG_TITLE_MAX),
      handle:
        params.handle === undefined || params.handle === null
          ? undefined
          : validateSlug(params.handle, "handle"),
    });
    return toView(blog, 0, 0);
  }

  async update(
    id: string,
    params: {
      organizationId: string;
      siteId: string;
      title?: unknown;
      handle?: unknown;
    },
  ): Promise<BlogView> {
    const existing = await this.findOwned(
      this.db,
      id,
      params.organizationId,
      params.siteId,
    );
    if (!existing) throw blogNotFound();

    const title =
      params.title === undefined
        ? existing.title
        : requireTitle(params.title, "title", BLOG_TITLE_MAX);
    const handle =
      params.handle === undefined
        ? existing.handle
        : validateSlug(params.handle, "handle");
    const handleChanged = handle !== existing.handle;
    const titleChanged = title !== existing.title;

    if (
      handleChanged &&
      (await this.handleTaken(this.db, existing.siteId, handle))
    ) {
      throw blogHandleTaken(handle);
    }

    let updated: BlogRow;
    try {
      updated = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .update(schema.blogs)
          .set({ title, handle, updatedAt: new Date() })
          .where(eq(schema.blogs.id, existing.id))
          .returning();
        if (handleChanged) {
          // Записи, которые уже бывали на витрине, сохраняют прежний адрес.
          const shown = await tx
            .select({
              id: schema.publications.id,
              slug: schema.publications.slug,
            })
            .from(schema.publications)
            .where(
              and(
                eq(schema.publications.blogId, existing.id),
                isNotNull(schema.publications.publishedAt),
              ),
            );
          await releasePaths(
            tx,
            existing.siteId,
            shown.map((p) => publicationPath(handle, p.slug)),
          );
          await recordRedirects(
            tx,
            existing.siteId,
            shown.map((p) => ({
              publicationId: p.id,
              oldPath: publicationPath(existing.handle, p.slug),
            })),
          );
        }
        return row;
      });
    } catch (err) {
      if (uniqueViolationOf(err) === "idx_blogs_site_handle") {
        throw blogHandleTaken(handle);
      }
      throw err;
    }

    const counts = await this.counts(existing.id);
    if ((titleChanged || handleChanged) && counts.publishedCount > 0) {
      await this.triggerRebuild(params.organizationId, existing.siteId);
    }
    return toView(updated, counts.publicationsCount, counts.publishedCount);
  }

  /**
   * Блог для записи: `newBlogTitle` — новый блог в той же транзакции;
   * `blogId` — существующий блог магазина; `category` — устаревшая категория
   * (блог по таблице, создаётся при отсутствии); ничего — блог по умолчанию,
   * если `fallbackToDefault`.
   */
  async resolveForWrite(
    ex: Executor,
    params: {
      organizationId: string;
      siteId: string;
      blogId?: unknown;
      newBlogTitle?: unknown;
      category?: unknown;
    },
    fallbackToDefault: boolean,
  ): Promise<BlogRow | undefined> {
    const { organizationId, siteId } = params;
    if (params.newBlogTitle !== undefined && params.newBlogTitle !== null) {
      const title = requireTitle(
        params.newBlogTitle,
        "newBlogTitle",
        BLOG_TITLE_MAX,
      );
      return this.insertBlog(ex, { organizationId, siteId, title });
    }
    if (
      params.blogId !== undefined &&
      params.blogId !== null &&
      params.blogId !== ""
    ) {
      if (typeof params.blogId !== "string") throw blogNotFound("blogId");
      const blog = await this.findOwned(
        ex,
        params.blogId,
        organizationId,
        siteId,
      );
      if (!blog) throw blogNotFound("blogId");
      return blog;
    }
    if (typeof params.category === "string" && params.category) {
      const legacy = LEGACY_CATEGORY_BLOGS[params.category];
      if (!legacy) {
        throw new PublicationError(
          "validation_failed",
          "Неизвестная категория. Выберите блог.",
          { status: 400, field: "blogId" },
        );
      }
      return this.ensureByHandle(ex, organizationId, siteId, legacy);
    }
    if (!fallbackToDefault) return undefined;
    return this.ensureByHandle(ex, organizationId, siteId, DEFAULT_BLOG);
  }

  async findOwned(
    ex: Executor,
    id: string,
    organizationId: string,
    siteId?: string,
  ): Promise<BlogRow | undefined> {
    const conditions = [
      eq(schema.blogs.id, id),
      eq(schema.blogs.organizationId, organizationId),
    ];
    if (siteId) conditions.push(eq(schema.blogs.siteId, siteId));
    const [row] = await ex
      .select()
      .from(schema.blogs)
      .where(and(...conditions))
      .limit(1);
    return row;
  }

  private async ensureByHandle(
    ex: Executor,
    organizationId: string,
    siteId: string,
    blog: { title: string; handle: string },
  ): Promise<BlogRow> {
    const now = new Date();
    await ex
      .insert(schema.blogs)
      .values({
        id: randomUUID(),
        siteId,
        organizationId,
        title: blog.title,
        handle: blog.handle,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [schema.blogs.siteId, schema.blogs.handle],
      });
    const [row] = await ex
      .select()
      .from(schema.blogs)
      .where(
        and(
          eq(schema.blogs.siteId, siteId),
          eq(schema.blogs.handle, blog.handle),
          eq(schema.blogs.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!row) throw blogNotFound("blogId");
    return row;
  }

  /**
   * Новый блог. Адрес задан — занят → 409; не задан — транслит названия,
   * при занятости `-2`, `-3`…
   */
  private async insertBlog(
    ex: Executor,
    params: {
      organizationId: string;
      siteId: string;
      title: string;
      handle?: string;
    },
  ): Promise<BlogRow> {
    const explicit = params.handle;
    const base = explicit ?? (slugify(params.title) || "blog");
    for (let attempt = 0; attempt < HANDLE_ATTEMPTS; attempt++) {
      const handle =
        explicit ?? (await this.freeHandle(ex, params.siteId, base));
      if (explicit && (await this.handleTaken(ex, params.siteId, handle))) {
        throw blogHandleTaken(handle);
      }
      const now = new Date();
      const [row] = await ex
        .insert(schema.blogs)
        .values({
          id: randomUUID(),
          siteId: params.siteId,
          organizationId: params.organizationId,
          title: params.title,
          handle,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [schema.blogs.siteId, schema.blogs.handle],
        })
        .returning();
      if (row) return row;
      // Адрес заняли между проверкой и вставкой.
      if (explicit) throw blogHandleTaken(handle);
    }
    throw blogHandleTaken(base);
  }

  private async freeHandle(
    ex: Executor,
    siteId: string,
    base: string,
  ): Promise<string> {
    const rows = await ex
      .select({ handle: schema.blogs.handle })
      .from(schema.blogs)
      .where(
        and(
          eq(schema.blogs.siteId, siteId),
          sql`(${schema.blogs.handle} = ${base} OR ${schema.blogs.handle} LIKE ${`${base}-%`})`,
        ),
      );
    const taken = new Set(rows.map((r) => r.handle));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base}-${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  private async handleTaken(
    ex: Executor,
    siteId: string,
    handle: string,
  ): Promise<boolean> {
    const [row] = await ex
      .select({ id: schema.blogs.id })
      .from(schema.blogs)
      .where(
        and(eq(schema.blogs.siteId, siteId), eq(schema.blogs.handle, handle)),
      )
      .limit(1);
    return Boolean(row);
  }

  private async counts(
    blogId: string,
  ): Promise<{ publicationsCount: number; publishedCount: number }> {
    const [row] = await this.db
      .select({
        publicationsCount: sql<number>`count(*)::int`,
        publishedCount: sql<number>`count(*) filter (where ${schema.publications.status} = 'published')::int`,
      })
      .from(schema.publications)
      .where(eq(schema.publications.blogId, blogId));
    return {
      publicationsCount: row?.publicationsCount ?? 0,
      publishedCount: row?.publishedCount ?? 0,
    };
  }

  private async triggerRebuild(tenantId: string, siteId: string) {
    try {
      await this.buildQueue.queueBuild({
        tenantId,
        siteId,
        priority: 5,
        trigger: "publication_change",
      });
      this.logger.log(`Rebuild queued for site ${siteId} (blog change)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to queue rebuild: ${msg}`);
    }
  }
}

function toView(
  blog: BlogRow,
  publicationsCount: number,
  publishedCount: number,
): BlogView {
  return {
    id: blog.id,
    title: blog.title,
    handle: blog.handle,
    publicationsCount,
    publishedCount,
    createdAt: blog.createdAt,
    updatedAt: blog.updatedAt,
  };
}
